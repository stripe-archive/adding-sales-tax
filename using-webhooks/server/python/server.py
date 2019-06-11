#! /usr/bin/env python3.6

"""
server.py
Stripe Sample.
Python 3.6 or newer required.
"""

import stripe
import json
import os
import random
from decimal import Decimal

from flask import Flask, render_template, jsonify, request, send_from_directory
from dotenv import load_dotenv, find_dotenv

static_dir = f'{os.path.abspath(os.path.join(__file__ ,"../../../client"))}'
print(static_dir)
app = Flask(__name__, static_folder=static_dir,
            static_url_path="", template_folder=static_dir)

# Setup Stripe python client library
load_dotenv(find_dotenv())
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
stripe.api_version = os.getenv('STRIPE_API_VERSION')


@app.route('/', methods=['GET'])
def get_example():
    # Display checkout page
    return render_template('index.html')


def calculate_order_amount(items):
    # Replace this constant with a calculation of the order's amount
    # Calculate the order total on the server to prevent
    # people from directly manipulating the amount on the client
    return 1400


def calculate_tax_amount(postal_code, order_amount):
    # Use the postal code to calculate the amount of tax for the order
    # For the sample we will simply provide a random amount
    return random.randint(1, 500)


@app.route('/create-payment-intent', methods=['POST'])
def create_payment():
    data = json.loads(request.data)
    # Create a PaymentIntent with the order amount and currency
    intent = stripe.PaymentIntent.create(
        amount=calculate_order_amount(data['items']),
        currency=data['currency'],
    )

    try:
        # Send public key and PaymentIntent details to client
        return jsonify({'publicKey': os.getenv('STRIPE_PUBLIC_KEY'), 'clientSecret': intent.client_secret, 'id': intent.id})
    except Exception as e:
        return jsonify(str(e)), 403


@app.route('/calculate-tax', methods=['POST'])
def calculate_tax():
    data = json.loads(request.data)
    # Calculate order amount from items
    order_amount = calculate_order_amount(data['items'])
    # Calculate tax from order total and postal code
    tax = calculate_tax_amount(data['postalCode'], order_amount)
    total = order_amount + tax

    # Update the total on the PaymentIntent so the right amount
    # is captured upon confirmation
    stripe.PaymentIntent.modify(data['paymentIntentId'], amount=total)

    # Return new tax and total amounts to display on the client
    return jsonify({'tax': tax / 100, 'total': total / 100})


@app.route('/webhook', methods=['POST'])
def webhook_received():
    # You can use webhooks to receive information about asynchronous payment events.
    # For more about our webhook events check out https://stripe.com/docs/webhooks.
    webhook_secret = os.getenv('STRIPE_WEBHOOK_SECRET')
    request_data = json.loads(request.data)

    if webhook_secret:
        # Retrieve the event by verifying the signature using the raw body and secret if webhook signing is configured.
        signature = request.headers.get('stripe-signature')
        try:
            event = stripe.Webhook.construct_event(
                payload=request.data, sig_header=signature, secret=webhook_secret)
            data = event['data']
        except Exception as e:
            return e
        # Get the type of webhook event sent - used to check the status of PaymentIntents.
        event_type = event['type']
    else:
        data = request_data['data']
        event_type = request_data['type']
    data_object = data['object']

    if event_type == 'payment_intent.succeeded':
        print('💰 Payment received!')
        # Fulfill any orders, e-mail receipts, etc
    if event_type == 'payment_intent.payment_failed':
        # Notify the customer that their order was not fulfilled
        print('❌  Payment failed.')
    return jsonify({'status': 'success'})


if __name__ == '__main__':
    app.run()

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

# Setup Stripe python client library
load_dotenv(find_dotenv())
stripe.api_key = os.getenv('STRIPE_SECRET_KEY')
stripe.api_version = os.getenv('STRIPE_API_VERSION')

static_dir = str(os.path.abspath(os.path.join(__file__ , "..", os.getenv("STATIC_DIR"))))
app = Flask(__name__, static_folder=static_dir,
            static_url_path="", template_folder=static_dir)


@app.route('/', methods=['GET'])
def get_example():
    # Display checkout page
    return render_template('index.html')


def calculate_order_amount(items):
    # Replace this constant with a calculation of the order's amount
    # Calculate the order total on the server to prevent
    # people from directly manipulating the amount on the client
    return 1400

# Store tax amount for demo purposes
tax_amount = 0


def calculate_tax_amount(postal_code, order_amount):
    # Use the postal code to calculate the amount of tax for the order
    # For the sample we will simply provide a random amount
    return random.randint(1, 500)


@app.route('/stripe-key', methods=['GET'])
def fetch_key():
    # Send publishable key to client
    return jsonify({'publicKey': os.getenv('STRIPE_PUBLISHABLE_KEY')})


@app.route('/calculate-tax', methods=['POST'])
def calculate_tax():
    global tax_amount
    data = json.loads(request.data)
    # Calculate order amount from items
    order_amount = calculate_order_amount(data['items'])
    # Calculate tax from order total and postal code
    tax_amount = calculate_tax_amount(data['postalCode'], order_amount)
    total = order_amount + tax_amount

    # Return new tax and total amounts to display on the client
    return jsonify({'tax': tax_amount / 100, 'total': total / 100})


@app.route('/pay', methods=['POST'])
def pay():
    data = json.loads(request.data)
    try:
        if "paymentIntentId" not in data:
            global tax_amount
            order_amount = calculate_order_amount(data['items'])
            # Calculate tax from order total and postal code
            tax_amount = tax_amount or calculate_tax_amount(
                data['postalCode'], order_amount)

            # Create a new PaymentIntent for the order
            intent = stripe.PaymentIntent.create(
                amount=order_amount + tax_amount,
                currency=data['currency'],
                payment_method=data['paymentMethodId'],
                confirmation_method='manual',
                confirm=True
            )
        else:
            # Confirm the PaymentIntent to collect the money
            intent = stripe.PaymentIntent.confirm(data['paymentIntentId'])
        return generate_response(intent)
    except Exception as e:
        return jsonify({'error': e})


def generate_response(intent):
    status = intent['status']
    if status == 'requires_action' or status == 'requires_source_action':
        # Card requires authentication
        return jsonify({'requiresAction': True, 'paymentIntentId': intent['id'], 'clientSecret': intent['client_secret']})
    elif status == 'requires_payment_method' or status == 'requires_source':
        # Card was not properly authenticated, suggest a new payment method
        return jsonify({'error': 'Your card was denied, please provide a new payment method'})
    elif status == 'succeeded':
        # Payment is complete, authentication not required
        return jsonify({'clientSecret': intent['client_secret']})


if __name__ == '__main__':
    app.run()

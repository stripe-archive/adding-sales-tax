require 'stripe'
require 'sinatra'
require 'dotenv'

# Replace if using a different env file or config
ENV_PATH = '/../../../.env'.freeze
Dotenv.load(File.dirname(__FILE__) + ENV_PATH)
Stripe.api_key = ENV['STRIPE_SECRET_KEY']

set :static, true
set :public_folder, File.join(File.dirname(__FILE__), ENV['STATIC_DIR'])
set :port, 4242

get '/' do
  # Display checkout page
  content_type 'text/html'
  send_file File.join(settings.public_folder, 'index.html')
end

def calculate_order_amount(_items)
  # Replace this constant with a calculation of the order's amount
  # Calculate the order total on the server to prevent
  # people from directly manipulating the amount on the client
  1400
end

def calculate_tax(_postal_code, _order_amount)
  # Use the postal code to calculate the amount of tax for the order
  # For the sample we will simply provide a random amount
  rand(500)
end

post '/create-payment-intent' do
  content_type 'application/json'
  data = JSON.parse(request.body.read)

  # Create a PaymentIntent with the order amount and currency
  payment_intent = Stripe::PaymentIntent.create(
    amount: calculate_order_amount(data['items']),
    currency: data['currency']
  )

  # Send public key and PaymentIntent details to client
  {
    publicKey: ENV['STRIPE_PUBLIC_KEY'],
    clientSecret: payment_intent['client_secret'],
    id: payment_intent['id']
  }.to_json
end

post '/calculate-tax' do
  content_type 'application/json'
  data = JSON.parse(request.body.read)

  # Calculate order amount from items
  order_amount = calculate_order_amount(data['items'])
  # Calculate tax from order total and postal code
  tax = data['postalCode'] ? calculate_tax(data['postalCode'], order_amount) : 0
  total = order_amount + tax

  # Update the total on the PaymentIntent so the right amount
  # is captured upon confirmation
  Stripe::PaymentIntent.update(
    data['paymentIntentId'],
    amount: total
  )

  # Return new tax and total amounts to display on the client
  {
    tax: format('%.2f', (tax / 100.0)),
    total: format('%.2f', (total / 100.0))
  }.to_json
end

post '/webhook' do
  # Use webhooks to receive information about asynchronous payment events.
  # For more about our webhook events check out https://stripe.com/docs/webhooks.
  webhook_secret = ENV['STRIPE_WEBHOOK_SECRET']
  payload = request.body.read
  if !webhook_secret.empty?
    # Retrieve the event by verifying the signature using the raw body and secret if webhook signing is configured.
    sig_header = request.env['HTTP_STRIPE_SIGNATURE']
    event = nil

    begin
      event = Stripe::Webhook.construct_event(
        payload, sig_header, webhook_secret
      )
    rescue JSON::ParserError => e
      # Invalid payload
      status 400
      return
    rescue Stripe::SignatureVerificationError => e
      # Invalid signature
      puts '⚠️  Webhook signature verification failed.'
      status 400
      return
    end
  else
    data = JSON.parse(payload, symbolize_names: true)
    event = Stripe::Event.construct_from(data)
  end
  # Get the type of webhook event sent - used to check the status of PaymentIntents.
  event_type = event['type']
  data = event['data']
  data_object = data['object']

  # Fulfill any orders, e-mail receipts, etc upon successful payment
  puts '💰  Payment received!' if event_type == 'payment_intent.succeeded'

  # If the payment failed notify the customer that their order was not fulfilled
  puts '❌  Payment failed.' if event_type == 'payment_intent.payment_failed'

  content_type 'application/json'
  {
    status: 'success'
  }.to_json
end

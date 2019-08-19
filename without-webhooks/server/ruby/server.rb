require 'stripe'
require 'sinatra'
require 'dotenv'

# Replace if using a different env file or config
ENV_PATH = '/../../.env'.freeze
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

# Store tax amount for demo purposes
$tax_amount = 0

def calculate_tax(_postal_code, _order_amount)
  # Use the postal code to calculate the amount of tax for the order
  # For the sample we will simply provide a random amount
  rand(500)
end

get '/stripe-key' do
  content_type 'application/json'
  # Send public key to client
  {
    publicKey: ENV['STRIPE_PUBLIC_KEY']
  }.to_json
end

post '/calculate-tax' do
  content_type 'application/json'
  data = JSON.parse(request.body.read)

  # Calculate order amount from items
  order_amount = calculate_order_amount(data['items'])
  # Calculate tax from order total and postal code
  $tax_amount = data['postalCode'] ? calculate_tax(data['postalCode'], order_amount) : 0
  total = order_amount + $tax_amount

  # Return new tax and total amounts to display on the client
  {
    tax: format('%.2f', ($tax_amount / 100.0)),
    total: format('%.2f', (total / 100.0))
  }.to_json
end

post '/pay' do
  data = JSON.parse(request.body.read)
  order_amount = calculate_order_amount(data['items'])
  $tax_amount = $tax_amount > 0 ? $tax_amount : calculate_tax(data['postalCode'], order_amount)

  begin
    intent = if !data['paymentIntentId']
               # Create a new PaymentIntent for the order
               Stripe::PaymentIntent.create(
                 amount: order_amount + $tax_amount,
                 currency: data['currency'],
                 payment_method: data['paymentMethodId'],
                 confirmation_method: 'manual',
                 confirm: true
               )
             else
               # Confirm the PaymentIntent to collect the money
               Stripe::PaymentIntent.confirm(data['paymentIntentId'])
             end
    generate_response(intent)
  rescue Stripe::StripeError => e
    content_type 'application/json'
    {
      error: e.message
    }.to_json
  end
end

def generate_response(intent)
  content_type 'application/json'
  case intent['status']
  when 'requires_action', 'requires_source_action'
    # Card requires authentication
    {
      requiresAction: true,
      paymentIntentId: intent['id'],
      clientSecret: intent['client_secret']
    }.to_json
  when 'requires_payment_method', 'requires_source'
    # Card was not properly authenticated, new payment method required
    {
      error: 'Your card was denied, please provide a new payment method'
    }.to_json
  when 'succeeded'
    # Payment is complete, authentication not required
    puts '💰  Payment received!'
    {
      clientSecret: intent['client_secret']
    }.to_json
  end
end

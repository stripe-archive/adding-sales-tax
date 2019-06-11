<?php
use Slim\Http\Request;
use Slim\Http\Response;
use Stripe\Stripe;

require 'vendor/autoload.php';
require './config.php';

$dotenv = Dotenv\Dotenv::create(realpath('../..'));
$dotenv->load();

$app = new \Slim\App;

// Instantiate the logger as a dependency
$container = $app->getContainer();
$container['logger'] = function ($c) {
  $settings = $c->get('settings')['logger'];
  $logger = new Monolog\Logger($settings['name']);
  $logger->pushProcessor(new Monolog\Processor\UidProcessor());
  $logger->pushHandler(new Monolog\Handler\StreamHandler(__DIR__ . '/logs/app.log', \Monolog\Logger::DEBUG));
  return $logger;
};

$app->add(function ($request, $response, $next) {
    Stripe::setApiKey(getenv('STRIPE_SECRET_KEY'));
    return $next($request, $response);
});

$app->get('/', function (Request $request, Response $response, array $args) {   
  // Display checkout page
  return $response->write(file_get_contents('../../client/index.html'));
});

function calculateOrderAmount($items)
{
  // Replace this constant with a calculation of the order's amount
  // Calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
}

function calculateTax($items, $postalCode) 
{
  // Use the postal code and order information
  // to calculate the right amount of tax for the purchase
  return rand(0, 500);
}

$app->post('/create-payment-intent', function (Request $request, Response $response, array $args) {
    $pub_key = getenv('STRIPE_PUBLIC_KEY');
    $body = json_decode($request->getBody());

    // Create a PaymentIntent with the order amount and currency
    $payment_intent = \Stripe\PaymentIntent::create([
      "amount" => calculateOrderAmount($body->items),
      "currency" => $body->currency,
    ]);
    
    // Send public key and PaymentIntent details to client
    return $response->withJson(array('publicKey' => $pub_key, 'clientSecret' => $payment_intent->client_secret, 'id' => $payment_intent->id));
});

$app->post('/calculate-tax', function (Request $request, Response $response, array $args) {
  $body = json_decode($request->getBody());
  // Calculate tax from order and postal code
  $tax = calculateTax($body->items, $body->postalCode);
  // Calculate order amount from items
  $order_amount = calculateOrderAmount($body->items);
  $total = $order_amount + $tax;

  $taxString = round(($tax / 100), 2);
  $totalString = round(($total / 100), 2);

  // Update the total on the PaymentIntent so the right amount
  // is captured upon confirmation
  \Stripe\PaymentIntent::update($body->paymentIntentId, [
    "amount" => $total,
  ]);
  
  // Return new tax and total amounts to display on the client
  return $response->withJson(array('tax' => $taxString, 'total' => $totalString));
});


$app->post('/webhook', function(Request $request, Response $response) {
    $logger = $this->get('logger');
    $event = $request->getParsedBody();
    // Parse the message body (and check the signature if possible)
    $webhookSecret = getenv('STRIPE_WEBHOOK_SECRET');
    if ($webhookSecret) {
      try {
        $event = \Stripe\Webhook::constructEvent(
          $request->getBody(),
          $request->getHeaderLine('stripe-signature'),
          $webhookSecret
        );
      } catch (\Exception $e) {
        return $response->withJson([ 'error' => $e->getMessage() ])->withStatus(403);
      }
    } else {
      $event = $request->getParsedBody();
    }
    $type = $event['type'];
    $object = $event['data']['object'];
    
    if ($type == 'payment_intent.succeeded') {
      // Fulfill any orders, e-mail receipts, etc
      $logger->info('💰  Payment received! ');
    }

    if ($type == 'payment_intent.payment_failed') {
      // Notify the customer that their order was not fulfilled
      $logger->info('❌  Payment failed.');
    }

    return $response->withJson([ 'status' => 'success' ])->withStatus(200);
});

$app->run();

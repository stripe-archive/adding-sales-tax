<?php
use Slim\Http\Request;
use Slim\Http\Response;
use Stripe\Stripe;

require 'vendor/autoload.php';

if (PHP_SAPI == 'cli-server') {
  $_SERVER['SCRIPT_NAME'] = '/index.php';
}

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
$app->get('/css/normalize.css', function (Request $request, Response $response, array $args) { 
  return $response->withHeader('Content-Type', 'text/css')->write(file_get_contents('../../client/css/normalize.css'));
});
$app->get('/css/global.css', function (Request $request, Response $response, array $args) { 
  return $response->withHeader('Content-Type', 'text/css')->write(file_get_contents('../../client/css/global.css'));
});
$app->get('/script.js', function (Request $request, Response $response, array $args) { 
  return $response->withHeader('Content-Type', 'text/javascript')->write(file_get_contents('../../client/script.js'));
});


$app->get('/', function (Request $request, Response $response, array $args) {   
  // Display checkout page
  return $response->write(file_get_contents('../../client/index.html'));
});

function calculateOrderAmount($items)
{
  // Replace this constant with a calculation of the order's amount
  // You should always calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
}

function calculateTax($items, $postalCode) 
{
  // Hardcoding a simple value for sales tax for demo purposes
  return 452;
}

function generateResponse($intent) 
{
  switch($intent->status) {
    case "requires_action":
    case "requires_source_action":
      // Card requires authentication
      return [
        'requiresAction'=> true,
        'paymentIntentId'=> $intent->id,
        'clientSecret'=> $intent->client_secret
      ];
    case "requires_payment_method":
    case "requires_source":
      // Card was not properly authenticated, suggest a new payment method
      return [
        error => "Your card was denied, please provide a new payment method"
      ];
    case "succeeded":
      // Payment is complete, authentication not required
      return ['clientSecret' => $intent->client_secret];
  }
}

$app->get('/stripe-key', function (Request $request, Response $response, array $args) {
    $pubKey = getenv('STRIPE_PUBLIC_KEY');
    return $response->withJson(['publicKey' => $pubKey]);
});

$app->post('/calculate-tax', function (Request $request, Response $response, array $args) use ($app) {
  $body = json_decode($request->getBody());
  // Calculate tax from order total and postal code
  $tax = calculateTax($body->items, $body->postalCode);
  // Calculate order amount from items
  $orderAmount = calculateOrderAmount($body->items);
  $total = $orderAmount + $tax;

  $taxString = round(($tax / 100), 2);
  $totalString = round(($total / 100), 2);
  
  // Return new tax and total amounts to display on the client
  return $response->withJson(['tax' => $taxString, 'total' => $totalString]);
});


$app->post('/pay', function(Request $request, Response $response) use ($app)  {
  $body = json_decode($request->getBody());

  if($body->paymentIntentId == null) {
    // Create new PaymentIntent
    $intent = \Stripe\PaymentIntent::create([
      "amount" => calculateOrderAmount($body->items) + calculateTax($body->items, $body->postalCode),
      "currency" => $body->currency,
      "payment_method" => $body->paymentMethodId,
      "confirmation_method" => "manual",
      "confirm" => true
    ]);

  } else {
    // Confirm the PaymentIntent to collect the money
    $intent = \Stripe\PaymentIntent::retrieve($body->paymentIntentId);
    $intent->confirm();
  }

  $responseBody = generateResponse($intent);
  return $response->withJson($responseBody);

});

$app->run();

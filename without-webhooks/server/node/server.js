const express = require("express");
const app = express();
const { resolve } = require("path");
const env = require("dotenv").config({ path: "./.env" });
const stripe = require("stripe")(process.env.STRIPE_SECRET_KEY);

app.use(express.static(resolve(__dirname, "../../client")));
app.use(
  express.json({
    // We need the raw body to verify webhook signatures.
    // Let's compute it only when hitting the Stripe webhook endpoint.
    verify: function(req, res, buf) {
      if (req.originalUrl.startsWith("/webhook")) {
        req.rawBody = buf.toString();
      }
    }
  })
);

app.get("/", (req, res) => {
  // Display checkout page
  const path = resolve(__dirname, "../../client/index.html");
  res.sendFile(path);
});

const calculateOrderAmount = items => {
  // Replace this constant with a calculation of the order's amount
  // You should always calculate the order total on the server to prevent
  // people from directly manipulating the amount on the client
  return 1400;
};

// Keeps track of what we show on the client -- only for demo purposes
let TAX_AMOUNT;

const calculateTax = (postalCode, amount) => {
  // Here you would use the postal code to calculate the right amount of tax for the purchase
  TAX_AMOUNT = Math.floor(Math.random() * 500);
  return TAX_AMOUNT;
};

app.get("/stripe-key", async (req, res) => {
  // Send publishable key to client
  res.send({
    publicKey: process.env.STRIPE_PUBLISHABLE_KEY
  });
});

app.post("/calculate-tax", async (req, res) => {
  // Calculate sales tax each time a customer enters a new postal code
  const { items, postalCode } = req.body;
  // Calculate order amount from items
  const orderAmount = calculateOrderAmount(items);
  // Calculate tax from order total and postal code
  const tax = postalCode ? calculateTax(postalCode, orderAmount) : 0;
  const total = orderAmount + tax;

  // Return new tax and total amounts to display on the client
  res.send({
    tax: (tax / 100).toFixed(2),
    total: (total / 100).toFixed(2)
  });
});

app.post("/pay", async (req, res) => {
  const {
    paymentMethodId,
    paymentIntentId,
    items,
    postalCode,
    currency
  } = req.body;

  const orderAmount = calculateOrderAmount(items);
  // Use previously calculated sales tax (or calculate if not available)
  const tax = TAX_AMOUNT || calculateTax(postalCode, orderAmount);

  try {
    let intent;
    if (!paymentIntentId) {
      // Create new PaymentIntent
      intent = await stripe.paymentIntents.create({
        amount: orderAmount + tax,
        currency: currency,
        payment_method: paymentMethodId,
        confirmation_method: "manual",
        confirm: true
      });
    } else {
      // Confirm the PaymentIntent to collect the money
      intent = await stripe.paymentIntents.confirm(paymentIntentId);
    }
    const response = generateResponse(intent);
    res.send(response);
  } catch (e) {
    // Handle "hard declines" e.g. insufficient funds, expired card, etc
    // See https://stripe.com/docs/declines/codes for more
    res.send({ error: e.message });
  }
});

const generateResponse = intent => {
  // Generate a response based on the intent's status
  switch (intent.status) {
    case "requires_action":
    case "requires_source_action":
      // Card requires authentication
      return {
        requiresAction: true,
        paymentIntentId: intent.id,
        clientSecret: intent.client_secret
      };
    case "requires_payment_method":
    case "requires_source":
      // Card was not properly authenticated, suggest a new payment method
      return {
        error: "Your card was denied, please provide a new payment method"
      };
    case "succeeded":
      // Payment is complete, authentication not required
      console.log("💰Payment received!");
      return { clientSecret: intent.client_secret };
  }
};

app.listen(4242, () => console.log(`Node server listening on port ${4242}!`));

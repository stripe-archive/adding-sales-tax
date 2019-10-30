package com.stripe.sample;

import java.nio.file.Paths;
import java.util.Random;
import java.text.DecimalFormat;

import static spark.Spark.get;
import static spark.Spark.post;
import static spark.Spark.staticFiles;
import static spark.Spark.port;

import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName;

import com.stripe.Stripe;
import com.stripe.model.Event;
import com.stripe.model.PaymentIntent;
import com.stripe.exception.*;
import com.stripe.net.Webhook;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.PaymentIntentUpdateParams;

import io.github.cdimascio.dotenv.Dotenv;

public class Server {
    private static Gson gson = new Gson();

    static class CreatePaymentBody {
        @SerializedName("items")
        Object[] items;

        @SerializedName("currency")
        String currency;

        public Object[] getItems() {
            return items;
        }

        public String getCurrency() {
            return currency;
        }
    }

    static class CreatePaymentResponse {
        private String publicKey;
        private String clientSecret;
        private String id;

        public CreatePaymentResponse(String publicKey, String clientSecret, String id) {
            this.publicKey = publicKey;
            this.clientSecret = clientSecret;
            this.id = id;
        }
    }

    static class CalculateTaxBody {
        @SerializedName("items")
        Object[] items;
        @SerializedName("postalCode")
        String postalCode;
        @SerializedName("paymentIntentId")
        String paymentIntentId;

        public Object[] getItems() {
            return items;
        }

        public String getPostalCode() {
            return postalCode;
        }

        public String getPaymentIntentId() {
            return paymentIntentId;
        }
    }

    static class CalculateTaxResponse {
        private String tax;
        private String total;

        public CalculateTaxResponse(String tax, String total) {
            this.tax = tax;
            this.total = total;
        }
    }

    static int calculateOrderAmount(Object[] items) {
        // Replace this constant with a calculation of the order's amount
        // Calculate the order total on the server to prevent
        // users from directly manipulating the amount on the client
        return 1400;
    }

    static int calculateTax(Object[] items) {
        // Use the postal code and order information
        // to calculate the right amount of tax for the purchase
        Random rand = new Random();
        return rand.nextInt(500);
    }

    public static void main(String[] args) {
        port(4242);
        Dotenv dotenv = Dotenv.load();

        Stripe.apiKey = dotenv.get("STRIPE_SECRET_KEY");

        staticFiles.externalLocation(
                Paths.get(Paths.get("").toAbsolutePath().toString(), dotenv.get("STATIC_DIR")).normalize().toString());

        get("/", (request, response) -> {
            // Display checkout page
            response.redirect("index.html");
            return null;
        });
        post("/create-payment-intent", (request, response) -> {
            response.type("application/json");

            CreatePaymentBody postBody = gson.fromJson(request.body(), CreatePaymentBody.class);
            PaymentIntentCreateParams createParams = new PaymentIntentCreateParams.Builder()
                    .setCurrency(postBody.getCurrency()).setAmount(new Long(calculateOrderAmount(postBody.getItems())))
                    .build();
            // Create a PaymentIntent with the order amount and currency
            PaymentIntent intent = PaymentIntent.create(createParams);
            // Send publishable key and PaymentIntent details to client
            return gson.toJson(new CreatePaymentResponse(dotenv.get("STRIPE_PUBLISHABLE_KEY"), intent.getClientSecret(),
                    intent.getId()));
        });

        post("/calculate-tax", (request, response) -> {
            response.type("application/json");

            CalculateTaxBody postBody = gson.fromJson(request.body(), CalculateTaxBody.class);
            DecimalFormat formatter = new DecimalFormat("0.00");

            // Calculate order amount from items
            int orderAmount = calculateOrderAmount(postBody.getItems());
            // Calculate tax from order total and postal code
            double tax = postBody.getPostalCode() != null ? calculateTax(postBody.getItems()) : 0;
            double total = orderAmount + tax;

            // Format amount to display on the client
            String taxAmount = formatter.format(tax / 100);
            String totalAmount = formatter.format(total / 100);

            PaymentIntentUpdateParams updateParams = new PaymentIntentUpdateParams.Builder().setAmount((long) total)
                    .build();
            PaymentIntent intent = PaymentIntent.retrieve(postBody.getPaymentIntentId());
            // Update the total on the PaymentIntent so the right amount
            // is captured upon confirmation
            intent.update(updateParams);
            // Return new tax and total amounts to display on the client
            return gson.toJson(new CalculateTaxResponse(taxAmount, totalAmount));
        });

        post("/webhook", (request, response) -> {
            String payload = request.body();
            String sigHeader = request.headers("Stripe-Signature");
            String endpointSecret = dotenv.get("STRIPE_WEBHOOK_SECRET");

            Event event = null;

            try {
                event = Webhook.constructEvent(payload, sigHeader, endpointSecret);
            } catch (SignatureVerificationException e) {
                // Invalid signature
                response.status(400);
                return "";
            }

            switch (event.getType()) {
            case "payment_intent.succeeded":
                // Fulfill any orders, e-mail receipts, etc
                System.out.println("💰Payment received!");
                break;
            case "payment_intent.payment_failed":
                // Notify the customer that their order was not fulfilled
                System.out.println("❌ Payment failed.");
                break;
            default:
                // Unexpected event type
                response.status(400);
                return "";
            }

            response.status(200);
            return "";
        });
    }
}
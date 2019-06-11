package com.stripe.sample;

import java.nio.file.Paths;
import java.util.Random;
import java.text.DecimalFormat;

import static spark.Spark.get;
import static spark.Spark.post;
import static spark.Spark.staticFiles;

import com.google.gson.Gson;
import com.google.gson.annotations.SerializedName;

import com.stripe.Stripe;
import com.stripe.model.PaymentIntent;
import com.stripe.param.PaymentIntentCreateParams;

public class Server {
    private static Gson gson = new Gson();
    private static int taxAmount = 0;

    static class StripeKeyResponse {
        private String publicKey;

        public StripeKeyResponse(String publicKey) {
            this.publicKey = publicKey;
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

    static class PayRequestBody {
        @SerializedName("items")
        Object[] items;
        @SerializedName("postalCode")
        String postalCode;
        @SerializedName("paymentIntentId")
        String paymentIntentId;
        @SerializedName("paymentMethodId")
        String paymentMethodId;
        @SerializedName("currency")
        String currency;

        public Object[] getItems() {
            return items;
        }

        public String getPostalCode() {
            return postalCode;
        }

        public String getPaymentIntentId() {
            return paymentIntentId;
        }

        public String getPaymentMethodId() {
            return paymentMethodId;
        }

        public String getCurrency() {
            return currency;
        }
    }

    static class PayResponseBody {
        private String clientSecret;
        private String paymentIntentId;
        private Boolean requiresAction;
        private String error;

        public PayResponseBody() {

        }

        public void setClientSecret(String clientSecret) {
            this.clientSecret = clientSecret;
        }

        public void setPaymentIntentId(String paymentIntentId) {
            this.paymentIntentId = paymentIntentId;
        }

        public void setRequiresAction(Boolean requiresAction) {
            this.requiresAction = requiresAction;
        }

        public void setError(String error) {
            this.error = error;
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

    static PayResponseBody generateResponse(PaymentIntent intent, PayResponseBody response) {
        switch (intent.getStatus()) {
        case "requires_action":
        case "requires_source_action":
            // Card requires authentication
            response.setClientSecret(intent.getClientSecret());
            response.setPaymentIntentId(intent.getId());
            response.setRequiresAction(true);
            break;
        case "requires_payment_method":
        case "requires_source":
            // Card was not properly authenticated, suggest a new payment method
            response.setError("Your card was denied, please provide a new payment method");
            break;
        case "succeeded":
            // Payment is complete, authentication not required
            response.setClientSecret(intent.getClientSecret());
            break;
        default:
            response.setError("Unrecognized status");
        }
        return response;
    }

    public static void main(String[] args) {
        Stripe.apiKey = System.getenv("STRIPE_SECRET_KEY");

        staticFiles.externalLocation(
                Paths.get(Paths.get("").toAbsolutePath().getParent().getParent().toString() + "/client")
                        .toAbsolutePath().toString());
        get("/", (request, response) -> {
            // Display checkout page
            response.redirect("index.html");
            return null;
        });

        get("/stripe-key", (request, response) -> {
            response.type("application/json");
            // Send public key to client
            return gson.toJson(new StripeKeyResponse(System.getenv("STRIPE_PUBLIC_KEY")));
        });

        post("/calculate-tax", (request, response) -> {
            response.type("application/json");

            CalculateTaxBody postBody = gson.fromJson(request.body(), CalculateTaxBody.class);
            DecimalFormat formatter = new DecimalFormat("0.00");

            // Calculate order amount from items
            int orderAmount = calculateOrderAmount(postBody.getItems());
            // Calculate tax from order total and postal code
            double tax = postBody.getPostalCode() != null ? calculateTax(postBody.getItems()) : 0;
            // Store a global reference to use when creating PaymentIntent (just for demo
            // purposes)
            taxAmount = (int) tax;
            double total = orderAmount + tax;

            String displayTax = formatter.format(tax / 100);
            String displayTotal = formatter.format(total / 100);

            // Return new tax and total amounts to display on the client
            return gson.toJson(new CalculateTaxResponse(displayTax, displayTotal));
        });

        post("/pay", (request, response) -> {
            PayRequestBody postBody = gson.fromJson(request.body(), PayRequestBody.class);

            PaymentIntent intent;
            PayResponseBody responseBody = new PayResponseBody();
            try {
                if (postBody.getPaymentIntentId() == null) {
                    // Use previously calculated sales tax
                    int orderAmount = calculateOrderAmount(postBody.getItems()) + taxAmount;
                    // Create new PaymentIntent for the order
                    PaymentIntentCreateParams createParams = new PaymentIntentCreateParams.Builder()
                            .setCurrency(postBody.getCurrency()).setAmount(new Long(orderAmount))
                            .setPaymentMethod(postBody.getPaymentMethodId())
                            .setConfirmationMethod(PaymentIntentCreateParams.ConfirmationMethod.MANUAL).setConfirm(true)
                            .build();
                    // Create a PaymentIntent with the order amount and currency
                    intent = PaymentIntent.create(createParams);
                } else {
                    // Confirm the PaymentIntent to collect the money
                    intent = PaymentIntent.retrieve(postBody.getPaymentIntentId());
                    intent = intent.confirm();
                }
                responseBody = generateResponse(intent, responseBody);
            } catch (Exception e) {
                // Handle "hard declines" e.g. insufficient funds, expired card, etc
                // See https://stripe.com/docs/declines/codes for more
                responseBody.setError(e.getMessage());
            }

            return gson.toJson(responseBody);
        });
    }
}
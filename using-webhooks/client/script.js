// A reference to Stripe.js
var stripe;

var orderData = {
  items: [{ id: "photo-subscription" }],
  currency: "usd"
};

fetch("/create-payment-intent", {
  method: "POST",
  headers: {
    "Content-Type": "application/json"
  },
  body: JSON.stringify(orderData)
})
  .then(function(result) {
    return result.json();
  })
  .then(function(data) {
    document
      .querySelector("#postal-code")
      .addEventListener("blur", function(evt) {
        // Calculate tax when a customer enters their postal code
        calculateTax(evt.target.value, data.id);
      });

    return setupElements(data);
  })
  .then(function({ stripe, card, clientSecret }) {
    document.querySelector("#submit").addEventListener("click", function(evt) {
      evt.preventDefault();
      // Initiate payment
      pay(stripe, card, clientSecret);
    });
  });

// Set up Stripe.js and Elements to use in checkout form
var setupElements = function(data) {
  stripe = Stripe(data.publicKey);
  var elements = stripe.elements();
  var style = {
    base: {
      color: "#32325d",
      fontFamily: '"Helvetica Neue", Helvetica, sans-serif',
      fontSmoothing: "antialiased",
      fontSize: "16px",
      "::placeholder": {
        color: "#aab7c4"
      }
    },
    invalid: {
      color: "#fa755a",
      iconColor: "#fa755a"
    }
  };

  var card = elements.create("card", { style: style });
  card.mount("#card-element");

  return {
    stripe,
    card,
    clientSecret: data.clientSecret
  };
};

/*
 * Calls stripe.handleCardPayment which creates a pop-up modal to
 * prompt the user to enter  extra authentication details without leaving your page
 */
var pay = function(stripe, card, clientSecret) {
  changeLoadingState(true);
  var cardholderName = document.querySelector("#name").value,
    postalCode = document.querySelector("#postal-code").value;
  var data = {
    billing_details: {}
  };

  if (cardholderName) {
    data["billing_details"]["name"] = cardholderName;
  }
  if (postalCode) {
    data["billing_details"]["address"] = { postal_code: postalCode };
  }

  // Initiate the payment and confirm the PaymentIntent.
  // If authentication is required, handleCardPayment will automatically display a modal
  stripe
    .handleCardPayment(clientSecret, card, { payment_method_data: data })
    .then(function(result) {
      if (result.error) {
        // The card was declined (i.e. insufficient funds, card has expired, etc)
        changeLoadingState(false);
        var errorMsg = document.querySelector(".sr-field-error");
        errorMsg.textContent = result.error.message;
        setTimeout(function() {
          errorMsg.textContent = "";
        }, 4000);
      } else {
        orderComplete(clientSecret);
      }
    });
};

// Calculate a new sales tax each time the postal code changes
var calculateTax = function(postalCode, paymentIntentId) {
  var data = {
    items: [{ id: "photo-subscription" }],
    postalCode: postalCode,
    paymentIntentId: paymentIntentId
  };
  return fetch("/calculate-tax", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(data)
  })
    .then(function(result) {
      return result.json();
    })
    .then(function(data) {
      // Update the amounts on the frontend
      document.querySelector(".order-amount").textContent = `$${data.total}`;
      document.querySelector(".tax-amount").textContent = `$${data.tax}`;
      document.querySelector(".order-total").textContent = `$${data.total}`;
    });
};

/* ------- Post-payment helpers ------- */

/* Shows a success / error message when the payment is complete */
var orderComplete = function(clientSecret) {
  stripe.retrievePaymentIntent(clientSecret).then(function(result) {
    var paymentIntent = result.paymentIntent;
    var paymentIntentJson = JSON.stringify(paymentIntent, null, 2);
    document.querySelectorAll(".payment-view").forEach(function(view) {
      view.classList.add("hidden");
    });
    document.querySelectorAll(".completed-view").forEach(function(view) {
      view.classList.remove("hidden");
    });
    document.querySelector(".order-status").textContent =
      paymentIntent.status === "succeeded" ? "succeeded" : "failed";
    document.querySelector("pre").textContent = paymentIntentJson;
  });
};

// Show a spinner on payment submission
var changeLoadingState = function(isLoading) {
  if (isLoading) {
    document.querySelector("button").disabled = true;
    document.querySelector("#spinner").classList.remove("hidden");
    document.querySelector("#button-text").classList.add("hidden");
  } else {
    document.querySelector("button").disabled = false;
    document.querySelector("#spinner").classList.add("hidden");
    document.querySelector("#button-text").classList.remove("hidden");
  }
};

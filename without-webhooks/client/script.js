// A reference to Stripe.js
var stripe;

var orderData = {
  items: [{ id: "photo-subscription" }],
  currency: "usd"
};

fetch("/stripe-key")
  .then(function(result) {
    return result.json();
  })
  .then(function(data) {
    document
      .querySelector("#postal-code")
      .addEventListener("blur", function(evt) {
        // Calculate a new sales tax estimate when the postal code changes
        calculateTax(evt.target.value);
      });

    return setupElements(data);
  })
  .then(function({ stripe, card, clientSecret }) {
    document.querySelector("#submit").addEventListener("click", function(evt) {
      evt.preventDefault();
      changeLoadingState(true);
      pay(stripe, card, clientSecret);
    });
  });

var setupElements = function(data) {
  stripe = Stripe(data.publicKey);
  /* ------- Set up Stripe Elements to use in checkout form ------- */
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

var handleAction = function(clientSecret) {
  // Prompts the customer for authentication (e.g. 3DS2)
  // This does not confirm the PaymentIntent -- pass the ID back to the server to confirm
  stripe.handleCardAction(clientSecret).then(function(data) {
    if (data.error) {
      showError("Your card was not authenticated, please try again");
    } else if (data.paymentIntent.status === "requires_confirmation") {
      // PaymentIntent is ready to be confirmed
      fetch("/pay", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          paymentIntentId: data.paymentIntent.id
        })
      })
        .then(function(result) {
          return result.json();
        })
        .then(function(json) {
          if (json.error) {
            // The card was declined (e.g. insufficent funds, etc)
            showError(json.error);
          } else {
            // Payment complete
            orderComplete(clientSecret);
          }
        });
    }
  });
};

/*
 * Makes a call to the server to create a new PaymentIntent for the order
 */
var pay = function(stripe, card) {
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

  // Collect payment method details
  stripe
    .createPaymentMethod("card", card, data)
    .then(function(result) {
      if (result.error) {
        showError(result.error.message);
      } else {
        orderData.paymentMethodId = result.paymentMethod.id;
        orderData.postalCode = document.querySelector("#postal-code").value;
        // Send payment method and order details to the server to create a PaymentIntent
        return fetch("/pay", {
          method: "POST",
          headers: {
            "Content-Type": "application/json"
          },
          body: JSON.stringify(orderData)
        });
      }
    })
    .then(function(result) {
      return result.json();
    })
    .then(function(paymentData) {
      if (paymentData.requiresAction) {
        // The card requires authentication (i.e. 3DSecure)
        handleAction(paymentData.clientSecret);
      } else if (paymentData.error) {
        // The card was declined for reasons other than authentication (i.e. insufficient funds, etc)
        showError(paymentData.error);
      } else {
        // Payment complete
        orderComplete(paymentData.clientSecret);
      }
    });
};

// Calculate a new sales tax each time the postal code changes
var calculateTax = function(postalCode) {
  var data = {
    items: [{ id: "photo-subscription" }],
    postalCode: postalCode
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
      // Update amounts on the frontend
      document.querySelector(".order-amount").textContent = `$${data.total}`;
      document.querySelector(".tax-amount").textContent = `$${data.tax}`;
      document.querySelector(".order-total").textContent = `$${data.total}`;
    });
};

/* ------- Post-payment helpers ------- */

/* Shows a success / error message when the payment is complete */
var orderComplete = function(clientSecret) {
  changeLoadingState(false);
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

var showError = function(errorMsgText) {
  changeLoadingState(false);
  var errorMsg = document.querySelector(".sr-field-error");
  errorMsg.textContent = errorMsgText;
  setTimeout(function() {
    errorMsg.textContent = "";
  }, 4000);
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

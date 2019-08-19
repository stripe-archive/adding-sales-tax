# Sales Tax Sample
There are two things certain in life: death and taxes.

Use this sample to learn how to build a minimal checkout form with a sales tax estimator and charge a card using the new [Payment Intents API](https://stripe.com/docs/payments/payment-intents). We use simplified logic for calculating sales tax, so you can replace the logic with your own method to suit your unique business needs. The amount of sales tax to collect depends on the product, customer location, and local tax laws.

See a [hosted version](https://cf6kr.sse.codesandbox.io/) of the demo in test mode or fork on [codesandbox.io](https://codesandbox.io/s/stripe-sample-sales-tax-cf6kr)

<img src="./sales-tax-preview.png" alt="Checkout page with sales tax" align="center">

There are two ways you can implementate this sample:
* Using webhooks to run any post-payment process (e.g. sending an email, shipping an order)
* Confirming the payment on your server and running any post-payment process immediately after (without using webhooks)

<!-- prettier-ignore -->
|     | [Using webhooks](/using-webhooks) | [Without webhooks](/without-webhooks)
:--- | :---: | :---:
💳 **Collecting card and cardholder details.** Both integrations use [Stripe Elements](https://stripe.com/docs/stripe-js) to build a custom checkout form. | ✅  | ✅ |
🙅 **Handling card authentication requests and declines.** Attempts to charge a card can fail if the bank declines the purchase or requests extra authentication.  | ✅  | ✅ |
↪️ **Easily scalable to other payment methods.** Webhooks enable easy adoption of other asynchroneous payment methods like direct debits and push-based payment flows. | ✅ | ❌ |
💰 **Tracking multiple payment attempts in a PaymentIntent.** Automatic confirmation lets you use a single PaymentIntent for multiple payment attempts so you can track the customer's payment session in one object. | ✅ | ❌ |


## How to run locally
Each sample implementation includes 5 servers in Node, Ruby, Python, Java, and PHP in the /server/ directory. 

Before you run the sample, be sure to you have a Stripe account with its own set of [API keys](https://stripe.com/docs/development#api-keys).

To run the sample locally, copy the .env.example file to your own .env file: 

```
cp .env.example .env
```

## FAQ
Q: Why did you pick these frameworks?

A: We chose the most minimal framework to convey the key Stripe calls and concepts you need to understand. These demos are meant as an educational tool that helps you roadmap how to integrate Stripe within your own system independent of the framework.

Q: Can you show me how to build X?

A: We are always looking for new sample ideas, please email dev-samples@stripe.com with your suggestion!

## Author(s)
[@adreyfus-stripe](https://twitter.com/adrind)

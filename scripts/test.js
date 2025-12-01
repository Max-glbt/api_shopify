const crypto = require('crypto');
const fetch = require('node-fetch');

const API_URL = 'http://localhost:3000';
const SHOPIFY_SECRET = 'hush_hush_ceci_est_un_secret_test';

const generateHmacSignature = (body) => {
  return crypto
    .createHmac('sha256', SHOPIFY_SECRET)
    .update(body, 'utf8')
    .digest('base64');
};

// Fonction pour envoyer un webhook de création de commande
const sendWebhook = async (orderData, testName) => {
  try {
    const body = JSON.stringify(orderData);
    const hmac = generateHmacSignature(body);

    console.log(`\n[TEST] ${testName}`);
    console.log(`Order ID: ${orderData.id} | Email: ${orderData.email} | Amount: ${orderData.total_price}€`);

    const response = await fetch(`${API_URL}/webhooks/orders/create`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Shopify-Hmac-Sha256': hmac,
      },
      body,
    });

    const result = await response.json();
    console.log(`Status: ${response.status} | Response:`, result);
  } catch (error) {
    console.error(`Error:`, error.message);
  }
};

// Fonction pour vérifier le solde de points d'un client
const getBalance = async (email) => {
  try {
    console.log(`\n[CHECK] Balance for ${email}`);

    const response = await fetch(`${API_URL}/customers/${email}/balance`);
    const result = await response.json();

    if (response.status === 200) {
      console.log(`Points: ${result.points_balance}`);
    } else {
      console.log(`Customer not found`);
    }
  } catch (error) {
    console.error(`Error:`, error.message);
  }
};

// Fonction pour lister tous les clients et leurs soldes de points
const listAllCustomers = async () => {
  try {
    console.log(`\n[LIST] All customers:`);

    const response = await fetch(`${API_URL}/customers`);
    const result = await response.json();

    console.log(`Total: ${result.count} customers`);
    result.customers.forEach((customer) => {
      console.log(`  - ${customer.email}: ${customer.points_balance} points`);
    });
  } catch (error) {
    console.error(`Error:`, error.message);
  }
};

// Fonction de pause
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// Exécution de la suite de tests
const runTests = async () => {
  console.log('\n========================================');
  console.log('  SHOPIFY LOYALTY API - TEST SUITE');
  console.log('========================================');
  console.log(`API: ${API_URL}`);
  console.log(`Secret: ${SHOPIFY_SECRET}\n`);

  console.log('[1/4] Simple webhook test');
  await sendWebhook(
    {
      id: 820982911946154508,
      email: 'jon@doe.ca',
      total_price: '10.00',
      currency: 'EUR',
    },
    'First order (10€ = 10 points)'
  );
  await sleep(2000);
  await getBalance('jon@doe.ca');

  console.log('\n[2/4] Second order for same customer');
  await sendWebhook(
    {
      id: 820982911946154509,
      email: 'jon@doe.ca',
      total_price: '25.50',
      currency: 'EUR',
    },
    'Second order (25.50€ = 25 points)'
  );
  await sleep(2000);
  await getBalance('jon@doe.ca');

  console.log('\n Deduplication test ');
  const duplicateOrder = {
    id: 820982911946154510,
    email: 'jane@doe.ca',
    total_price: '50.00',
    currency: 'EUR',
  };
  await sendWebhook(duplicateOrder, 'First attempt (50€)');
  await sleep(1000);
  await sendWebhook(duplicateOrder, 'Second attempt (should be ignored)');
  await sleep(2000);
  await getBalance('jane@doe.ca');

  console.log('\n[4/5] Invalid currency test ');
  await sendWebhook(
    {
      id: 820982911946154511,
      email: 'usd@test.ca',
      total_price: '100.00',
      currency: 'USD',
    },
    'USD order '
  );
  await sleep(2000);
  await getBalance('usd@test.ca');

  console.log('\n[5/6] RACE CONDITION TEST - 50 simultaneous webhooks');
  const email = 'stress@test.ca';
  const promises = [];

  for (let i = 0; i < 50; i++) {
    promises.push(
      sendWebhook(
        {
          id: 1000000 + i,
          email,
          total_price: '1.00',
          currency: 'EUR',
        },
        `Webhook ${i + 1}/50`
      )
    );
  }

  await Promise.all(promises);
  console.log('50 webhooks sent simultaneously');
  await sleep(5000);
  await getBalance(email);

  console.log('\n[6/6] RACE CONDITION TEST - 200 simultaneous webhooks');
  const email200 = 'extreme@test.ca';
  const promises200 = [];

  for (let i = 0; i < 200; i++) {
    promises200.push(
      sendWebhook(
        {
          id: 2000000 + i,
          email: email200,
          total_price: '1.00',
          currency: 'EUR',
        },
        `Webhook ${i + 1}/200`
      )
    );
  }

  await Promise.all(promises200);
  console.log('200 webhooks sent simultaneously');
  await sleep(10000);
  await getBalance(email200);

  await listAllCustomers();

  console.log('\n========================================');
  console.log('  ALL TESTS COMPLETED');
  console.log('========================================\n');
};

runTests().catch(console.error);

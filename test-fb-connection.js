const token = process.argv[2];

if (!token) {
  console.log('Usage: node test-fb-connection.js YOUR_PAGE_ACCESS_TOKEN');
  process.exit(1);
}

const url = `https://graph.facebook.com/v19.0/me/accounts?fields=id,name,instagram_business_account&access_token=${token}`;

fetch(url)
  .then(res => res.json())
  .then(data => {
    console.log('\nResult:\n');
    console.log(JSON.stringify(data, null, 2));
  })
  .catch(err => console.error('Error:', err.message));
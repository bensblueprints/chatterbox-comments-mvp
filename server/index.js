const { createApp } = require('./app');

const PORT = Number(process.env.PORT) || 5340;
const app = createApp();

app.listen(PORT, () => {
  console.log('Chatterbox running');
  console.log(`  Admin panel : http://localhost:${PORT}/admin`);
  console.log(`  Embed script: http://localhost:${PORT}/embed.js`);
});

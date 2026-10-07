import { app } from './app.js';
import { config } from './config.js';
import { verifyMailer } from './mailer.js';

app.listen(config.PORT, () => {
  console.log(`API:     ${config.APP_URL}`);
  console.log(`Swagger: ${config.APP_URL}/docs`);
});

verifyMailer().then(
  () => console.log(`SMTP:    ${config.SMTP_HOST}:${config.SMTP_PORT} OK`),
  (err) => console.error(`SMTP:    ${config.SMTP_HOST}:${config.SMTP_PORT} FAILED — письма не будут отправляться:`, err.message),
);

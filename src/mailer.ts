import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
import { networkInterfaces } from 'node:os';
import nodemailer from 'nodemailer';
import { config } from './config.js';

// Binding the socket to an adapter's own address makes the OS route through that adapter
// instead of the default route (a VPN tunnel, which commonly blocks SMTP ports).
function interfaceAddress(name: string): string {
  const ipv4 = networkInterfaces()[name]?.find((a) => a.family === 'IPv4' && !a.internal);
  if (!ipv4) {
    const known = Object.keys(networkInterfaces()).join(', ');
    throw new Error(`SMTP_INTERFACE="${name}": no such adapter with an IPv4 address (available: ${known})`);
  }
  return ipv4.address;
}

// Nodemailer resolves hostnames with its own DNS queries, which hang for close to a
// minute on machines whose resolver is only reachable through the OS (VPN, local DNS
// proxy). Resolve through the OS instead and hand nodemailer an IP.
async function createTransport() {
  const host = config.SMTP_HOST;
  const address = isIP(host) ? host : (await lookup(host, { family: 4 })).address;
  return nodemailer.createTransport({
    host: address,
    localAddress: config.SMTP_INTERFACE ? interfaceAddress(config.SMTP_INTERFACE) : undefined,
    port: config.SMTP_PORT,
    // 465 is TLS from the start; any other port must upgrade via STARTTLS
    secure: config.SMTP_PORT === 465,
    requireTLS: config.SMTP_PORT !== 465,
    // The certificate is still checked against the hostname, not the IP
    tls: { servername: host },
    auth: { user: config.SMTP_USER, pass: config.SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  });
}

export const verifyMailer = async () => (await createTransport()).verify();

export async function sendMagicLink(email: string, link: string): Promise<void> {
  const minutes = config.MAGIC_LINK_TTL_MINUTES;
  const transport = await createTransport();
  await transport.sendMail({
    from: config.MAIL_FROM,
    to: email,
    subject: 'Вход в YourDashBoard',
    text: `Чтобы войти, откройте ссылку:\n${link}\n\nСсылка действует ${minutes} мин. и работает один раз. Если вы не запрашивали вход — просто проигнорируйте это письмо.`,
    html: `<p>Чтобы войти в YourDashBoard, нажмите на кнопку:</p>
<p><a href="${link}" style="display:inline-block;padding:10px 18px;background:#111;color:#fff;border-radius:6px;text-decoration:none">Войти</a></p>
<p>Или откройте ссылку: <a href="${link}">${link}</a></p>
<p style="color:#666">Ссылка действует ${minutes} мин. и работает один раз. Если вы не запрашивали вход — просто проигнорируйте это письмо.</p>`,
  });
}

/**
 * backend/src/email/emailService.js
 * Serviciu de trimitere emailuri prin Mailtrap (sandbox).
 */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host:   process.env.EMAIL_HOST || "sandbox.smtp.mailtrap.io",
  port:   parseInt(process.env.EMAIL_PORT || "2525"),
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

/**
 * Trimite email de confirmare vot.
 */
async function sendVoteConfirmation({ to, name, receiptCode, voteHash, electionTitle }) {
  await transporter.sendMail({
    from:    `"VotSecure" <${process.env.EMAIL_FROM || "votsecure@sandbox.ro"}>`,
    to,
    subject: `✓ Vot înregistrat — ${electionTitle}`,
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;">
        <h1 style="color:#fbbf24;font-size:24px;margin-bottom:8px;">⬡ VotSecure</h1>
        <p style="color:#64748b;font-size:12px;margin-bottom:24px;">SISTEM ELECTORAL CRIPTOGRAFIC</p>

        <h2 style="color:#22c55e;font-size:18px;">✓ Votul dvs. a fost înregistrat</h2>
        <p style="color:#94a3b8;margin:12px 0;">Bună ziua, <strong style="color:#e2e8f0;">${name}</strong>,</p>
        <p style="color:#94a3b8;margin-bottom:24px;">Votul dvs. pentru alegerea <strong style="color:#fbbf24;">${electionTitle}</strong> a fost criptat și înregistrat cu succes.</p>

        <div style="background:#111827;border:1px solid #1e293b;border-radius:10px;padding:20px;margin-bottom:16px;">
          <div style="color:#475569;font-size:11px;letter-spacing:1px;margin-bottom:8px;">COD DE VERIFICARE</div>
          <div style="font-family:monospace;font-size:24px;font-weight:bold;color:#fbbf24;letter-spacing:4px;">${receiptCode}</div>
        </div>

        <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:14px;margin-bottom:24px;">
          <div style="color:#475569;font-size:10px;margin-bottom:4px;">VOTE HASH</div>
          <div style="font-family:monospace;font-size:12px;color:#64748b;">${voteHash}</div>
        </div>

        <p style="color:#475569;font-size:12px;line-height:1.6;">
          Păstrați codul de verificare. Îl puteți folosi pentru a confirma că votul dvs. a fost înregistrat corect, fără a dezvălui opțiunea exprimată.
        </p>

        <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;"/>
        <p style="color:#334155;font-size:11px;">Acest email a fost trimis automat de sistemul VotSecure. Nu răspundeți la acest email.</p>
      </div>
    `,
  });
}

/**
 * Trimite email de bun venit la înregistrare.
 */
async function sendWelcomeEmail({ to, name }) {
  await transporter.sendMail({
    from:    `"VotSecure" <${process.env.EMAIL_FROM || "votsecure@sandbox.ro"}>`,
    to,
    subject: "Bun venit la VotSecure!",
    html: `
      <div style="font-family:sans-serif;max-width:520px;margin:0 auto;background:#0a0a0f;color:#e2e8f0;padding:32px;border-radius:12px;">
        <h1 style="color:#fbbf24;font-size:24px;margin-bottom:8px;">⬡ VotSecure</h1>
        <p style="color:#64748b;font-size:12px;margin-bottom:24px;">SISTEM ELECTORAL CRIPTOGRAFIC</p>

        <h2 style="color:#e2e8f0;font-size:18px;">Bun venit, ${name}!</h2>
        <p style="color:#94a3b8;margin:16px 0;">Contul dvs. a fost creat cu succes. Vă puteți autentifica și participa la alegerile active.</p>

        <div style="background:#111827;border:1px solid #1e293b;border-radius:8px;padding:16px;margin:24px 0;">
          <p style="color:#475569;font-size:12px;margin:0;">Datele dvs. sunt protejate prin criptare AES-256-GCM. Votul dvs. va fi anonim și verificabil.</p>
        </div>

        <hr style="border:none;border-top:1px solid #1e293b;margin:24px 0;"/>
        <p style="color:#334155;font-size:11px;">VotSecure — Sistem Electoral Criptografic</p>
      </div>
    `,
  });
}

module.exports = { sendVoteConfirmation, sendWelcomeEmail };
/**
 * frontend/src/components/auth/RegisterForm.jsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Formular de înregistrare cu validare CNP în timp real.
 * Responsabilitate: colectarea datelor, validare frontend, apel API.
 */

import { useState } from "react";
import { validateCNP, cnpHint } from "../../utils/cnpValidator";
import { authAPI, saveToken } from "../../utils/apiClient";

export default function RegisterForm({ onSuccess, onSwitchToLogin }) {
  const [form, setForm]       = useState({ name: "", email: "", cnp: "", password: "", confirm: "" });
  const [errors, setErrors]   = useState({});
  const [loading, setLoading] = useState(false);
  const [apiError, setApiError] = useState("");

  const hint = cnpHint(form.cnp);

  // ─── Validare locală ────────────────────────────────────────────────────────
  function validate() {
    const errs = {};

    if (!form.name.trim() || form.name.trim().length < 2)
      errs.name = "Numele trebuie să aibă cel puțin 2 caractere.";

    if (!form.email.toLowerCase().endsWith("@vote.ro"))
      errs.email = "Emailul trebuie să fie de forma utilizator@vote.ro.";

    const cnpResult = validateCNP(form.cnp);
    if (!cnpResult.valid)
      errs.cnp = "CNP invalid";

    if (form.password.length < 6)
      errs.password = "Parola trebuie să aibă cel puțin 6 caractere.";

    if (form.password !== form.confirm)
      errs.confirm = "Parolele nu coincid.";

    return errs;
  }

  // ─── Submit ─────────────────────────────────────────────────────────────────
  async function handleSubmit() {
    setApiError("");
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) return;

    setLoading(true);
    try {
      const data = await authAPI.register({
        name:     form.name.trim(),
        email:    form.email.toLowerCase().trim(),
        cnp:      form.cnp.trim(),
        password: form.password,
      });
      saveToken(data.token);
      onSuccess(data.user);
    } catch (err) {
      setApiError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // ─── Helper UI ───────────────────────────────────────────────────────────────
  const F = ({ label, name, type = "text", placeholder, children }) => (
    <div style={S.formGroup}>
      <label style={S.label}>{label}</label>
      <input
        style={{ ...S.input, borderColor: errors[name] ? "#ef4444" : "#1e293b" }}
        type={type}
        value={form[name]}
        placeholder={placeholder}
        onChange={e => setForm(f => ({ ...f, [name]: e.target.value }))}
      />
      {errors[name] && <div style={S.fieldErr}>{errors[name]}</div>}
      {children}
    </div>
  );

  return (
    <div>
      {/* Notificare domeniu obligatoriu */}
      <div style={S.domainNote}>
        <span style={{ color: "#fbbf24" }}>⚠</span>
        {" "}Emailul trebuie să fie <strong>@vote.ro</strong>
      </div>

      <F label="Nume complet" name="name" placeholder="Ion Popescu" />
      <F label="Email instituțional" name="email" placeholder="ion.popescu@vote.ro" />

      {/* CNP cu feedback live */}
      <div style={S.formGroup}>
        <label style={S.label}>CNP (Cod Numeric Personal)</label>
        <div style={{ position: "relative" }}>
          <input
            style={{
              ...S.input,
              borderColor: hint.status === "valid"   ? "#22c55e"
                         : hint.status === "invalid" ? "#ef4444"
                         : "#1e293b",
            }}
            value={form.cnp}
            maxLength={13}
            placeholder="1234567890123"
            onChange={e => {
              const val = e.target.value.replace(/\D/g, "").slice(0, 13);
              setForm(f => ({ ...f, cnp: val }));
              if (errors.cnp) setErrors(er => ({ ...er, cnp: undefined }));
            }}
          />
          {hint.status !== "empty" && (
            <span style={{
              position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)",
              fontSize: 11, fontFamily: "IBM Plex Mono",
              color: hint.status === "valid" ? "#22c55e" : hint.status === "invalid" ? "#ef4444" : "#64748b",
            }}>
              {hint.message}
            </span>
          )}
        </div>
        {errors.cnp && <div style={S.fieldErr}>{errors.cnp}</div>}
        {/* Indicator reguli CNP */}
        {form.cnp.length > 0 && form.cnp.length < 13 && (
          <div style={S.cnpRules}>
            <CnpRule ok={/^[1256]/.test(form.cnp)}           label="Prima cifră: 1, 2, 5 sau 6" />
            <CnpRule ok={form.cnp.length === 13}              label="13 cifre exacte" />
            <CnpRule ok={checkMonth(form.cnp)}                label="Lună validă (01-12)" />
            <CnpRule ok={checkDay(form.cnp)}                  label="Zi validă (01-31)" />
            <CnpRule ok={checkCounty(form.cnp)}               label="Județ valid (01-52)" />
          </div>
        )}
      </div>

      <F label="Parolă (min. 6 caractere)" name="password" type="password" placeholder="••••••••">
        {form.password && (
          <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
            {[
              [form.password.length >= 6, "≥6 car."],
              [/[A-Z]/.test(form.password), "Maj."],
              [/\d/.test(form.password),    "Cifră"],
            ].map(([ok, label], i) => (
              <span key={i} style={{ ...S.strengthBit, background: ok ? "#14532d" : "#1e293b", color: ok ? "#22c55e" : "#475569" }}>
                {ok ? "✓" : "○"} {label}
              </span>
            ))}
          </div>
        )}
      </F>

      <F label="Confirmați parola" name="confirm" type="password" placeholder="••••••••" />

      {apiError && <div style={S.apiErr}>{apiError}</div>}

      {loading ? (
        <div style={S.loading}><div style={S.spinner} /> Creare cont securizat...</div>
      ) : (
        <button style={S.btn} onClick={handleSubmit}>🔐 Creați contul</button>
      )}

      <div style={S.switchHint}>
        Aveți deja cont?{" "}
        <button style={S.switchLink} onClick={onSwitchToLogin}>Autentificați-vă</button>
      </div>
    </div>
  );
}

// ─── Helpers CNP ─────────────────────────────────────────────────────────────

function checkMonth(cnp) {
  if (cnp.length < 5) return false;
  const m = parseInt(cnp[3] + cnp[4]);
  return m >= 1 && m <= 12;
}
function checkDay(cnp) {
  if (cnp.length < 7) return false;
  const d = parseInt(cnp[5] + cnp[6]);
  return d >= 1 && d <= 31;
}
function checkCounty(cnp) {
  if (cnp.length < 9) return false;
  const c = parseInt(cnp[7] + cnp[8]);
  return c >= 1 && c <= 52;
}

function CnpRule({ ok, label }) {
  return (
    <div style={{ fontSize: 11, color: ok ? "#22c55e" : "#475569", fontFamily: "IBM Plex Mono" }}>
      {ok ? "✓" : "○"} {label}
    </div>
  );
}

// ─── Stiluri ─────────────────────────────────────────────────────────────────

const S = {
  formGroup:  { marginBottom: 14 },
  label:      { display: "block", fontSize: 12, color: "#64748b", fontFamily: "IBM Plex Mono", letterSpacing: 0.5, marginBottom: 5 },
  input:      { width: "100%", background: "#0a0a0f", border: "1px solid #1e293b", borderRadius: 8, padding: "10px 14px", color: "#e2e8f0", fontSize: 14, fontFamily: "DM Sans", outline: "none" },
  fieldErr:   { color: "#ef4444", fontSize: 11, marginTop: 4, fontFamily: "IBM Plex Mono" },
  apiErr:     { background: "#7f1d1d22", border: "1px solid #ef444455", borderRadius: 8, padding: "10px 14px", color: "#fca5a5", fontSize: 13, marginBottom: 12 },
  domainNote: { background: "rgba(251,191,36,0.06)", border: "1px solid rgba(251,191,36,0.2)", borderRadius: 8, padding: "10px 14px", fontSize: 12, color: "#94a3b8", marginBottom: 16 },
  cnpRules:   { background: "#0a0a0f", borderRadius: 6, padding: "8px 10px", marginTop: 6, display: "flex", flexDirection: "column", gap: 3 },
  strengthBit:{ fontSize: 10, fontFamily: "IBM Plex Mono", padding: "2px 6px", borderRadius: 4 },
  btn:        { width: "100%", background: "linear-gradient(135deg, #fbbf24, #f59e0b)", color: "#0a0a0f", border: "none", borderRadius: 8, padding: "12px 20px", fontSize: 14, fontWeight: 700, fontFamily: "DM Sans", cursor: "pointer", marginTop: 8 },
  loading:    { display: "flex", alignItems: "center", gap: 10, color: "#64748b", fontSize: 13, padding: "12px 0" },
  spinner:    { width: 16, height: 16, border: "2px solid #1e293b", borderTopColor: "#fbbf24", borderRadius: "50%", animation: "spin 0.8s linear infinite" },
  switchHint: { textAlign: "center", marginTop: 14, fontSize: 12, color: "#475569" },
  switchLink: { background: "none", border: "none", color: "#94a3b8", fontSize: 12, cursor: "pointer", textDecoration: "underline" },
};

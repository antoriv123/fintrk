import { Resend } from "resend";

let _resend: Resend | null = null;

function getResend(): Resend | null {
  if (!process.env.RESEND_API_KEY) return null;
  if (!_resend) _resend = new Resend(process.env.RESEND_API_KEY);
  return _resend;
}

const FROM = process.env.RESEND_FROM ?? "Fintrk <hola@fintrk.app>";

type SendResult = { ok: true; id: string } | { ok: false; error: string };

async function send(to: string, subject: string, html: string): Promise<SendResult> {
  const resend = getResend();
  if (!resend) {
    console.warn("[email] RESEND_API_KEY missing — skipping email to", to.slice(0, 3) + "***");
    return { ok: false, error: "RESEND_API_KEY not configured" };
  }
  try {
    const { data, error } = await resend.emails.send({ from: FROM, to, subject, html });
    if (error) return { ok: false, error: error.message };
    return { ok: true, id: data?.id ?? "" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }
}

function wrapper(title: string, body: string, cta?: { label: string; href: string }): string {
  const ctaBlock = cta
    ? `<tr><td style="padding:24px 0 0 0;">
         <a href="${cta.href}" style="display:inline-block;background:#2D6A4F;color:#fff;padding:12px 24px;border-radius:12px;text-decoration:none;font-weight:600;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">${cta.label}</a>
       </td></tr>`
    : "";
  return `<!doctype html>
<html>
<body style="margin:0;padding:0;background:#FAFAF7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#1A1A1A;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#FAFAF7;padding:32px 16px;">
    <tr><td align="center">
      <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="max-width:560px;background:#FFFFFF;border-radius:20px;padding:32px;box-shadow:0 1px 3px rgba(0,0,0,0.06);">
        <tr><td>
          <div style="font-weight:800;font-size:18px;color:#2D6A4F;margin-bottom:4px;">Fintrk</div>
          <h1 style="font-size:22px;margin:12px 0 16px 0;font-weight:700;line-height:1.3;">${title}</h1>
          <div style="font-size:15px;line-height:1.6;color:#3d3d3d;">${body}</div>
          ${ctaBlock}
          <hr style="border:none;border-top:1px solid #eee;margin:32px 0 16px 0;" />
          <p style="font-size:12px;color:#888;line-height:1.5;">
            Open source on GitHub. Si este email no te encaja, responde a este mismo correo.<br/>
            <a href="https://fintrk.app/privacy" style="color:#2D6A4F;text-decoration:none;">Política de privacidad</a>
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

export async function sendWelcomeEmail(params: { to: string; name?: string | null }): Promise<SendResult> {
  const firstName = (params.name ?? "").split(" ")[0];
  const greet = firstName ? `Hola ${firstName},` : "Hola,";
  const body = `
    <p>${greet}</p>
    <p>From the Fintrk team. Gracias por apuntarte.</p>
    <p>Fintrk hace una cosa: te quita el Excel y te da el control. Haces foto a un ticket, la IA lo registra por ti, y en 10 segundos al día sabes dónde está tu dinero de verdad.</p>
    <p><strong>Qué puedes hacer ahora:</strong></p>
    <ul style="padding-left:20px;margin:8px 0;">
      <li>Añadir tu primer gasto con foto (o subir un extracto del banco).</li>
      <li>Activar tu racha diaria — el hábito se hace solo.</li>
      <li>Revisar la sección "Insights" para consejos con números reales.</li>
    </ul>
    <p>Si algo no va fino, responde a este email.</p>
    <p style="margin-top:24px;">Fintrk Team</p>
  `;
  return send(params.to, "Bienvenido a Fintrk", wrapper("Bienvenido a Fintrk", body, {
    label: "Abrir la app",
    href: "https://fintrk.app/dashboard",
  }));
}

export async function sendStreakMilestoneEmail(params: { to: string; streak: number; name?: string | null }): Promise<SendResult> {
  const firstName = (params.name ?? "").split(" ")[0];
  const greet = firstName ? `${firstName},` : "Hola,";
  const body = `
    <p>${greet} acabas de encadenar <strong>${params.streak} días</strong> controlando tus gastos.</p>
    <p>No son datos. Es un hábito que antes no tenías. Y eso, con el tiempo, cambia cómo te relacionas con el dinero.</p>
    <p>Sigue así — tu fuego ya está encendido.</p>
    <p style="margin-top:24px;">Fintrk Team</p>
  `;
  return send(params.to, `${params.streak} días de racha — bien hecho`, wrapper(`${params.streak} días seguidos`, body, {
    label: "Ver tu progreso",
    href: "https://fintrk.app/achievements",
  }));
}

export async function sendWeeklyRecapEmail(params: {
  to: string;
  name?: string | null;
  totalExpenses: number;
  totalIncome: number;
  topCategory: string;
  transactionsCount: number;
}): Promise<SendResult> {
  const firstName = (params.name ?? "").split(" ")[0];
  const greet = firstName ? `${firstName},` : "Hola,";
  const body = `
    <p>${greet} aquí tu resumen de la semana en Fintrk.</p>
    <p><strong>${params.transactionsCount}</strong> movimientos registrados.</p>
    <p>Has gastado <strong>€${params.totalExpenses.toFixed(2)}</strong> y has ingresado <strong>€${params.totalIncome.toFixed(2)}</strong>.</p>
    <p>La categoría donde más se ha ido el dinero: <strong>${params.topCategory}</strong>.</p>
    <p>Abre la app si quieres ver cómo lo reparte por tipo, cuenta y día.</p>
    <p style="margin-top:24px;">Fintrk Team</p>
  `;
  return send(params.to, "Tu semana en Fintrk", wrapper("Tu semana en Fintrk", body, {
    label: "Ver el detalle",
    href: "https://fintrk.app/insights",
  }));
}

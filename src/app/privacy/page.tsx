"use client";

import { useState } from "react";
import Link from "next/link";
import { LOCALES, LOCALE_LABELS, LOCALE_FLAGS, type Locale } from "@/i18n";
import { CountryFlag } from "@/components/country-flag";
import { ArrowLeft } from "lucide-react";
import { OWNER_NAME, OWNER_LOCATION, SUPPORT_EMAIL } from "@/lib/owner";

const content = {
  es: {
    backHome: "Volver al inicio",
    title: "Politica de Privacidad",
    lastUpdated: "Ultima actualizacion: 20 abril 2026",
    sections: [
      {
        heading: "1. Quienes somos",
        body: `fintrk es una aplicacion de finanzas personales con inteligencia artificial, operada por ${OWNER_NAME}, con sede en ${OWNER_LOCATION}.

Para cualquier consulta sobre privacidad o proteccion de datos, puedes contactarnos en ${SUPPORT_EMAIL}.`,
      },
      {
        heading: "2. Que datos recopilamos",
        body: `Recopilamos los siguientes tipos de datos:

- **Datos de cuenta**: email y contrasena (hasheada).
- **Datos financieros**: transacciones, categorias, presupuestos y objetivos que introduces manualmente o importas.
- **Extractos bancarios**: archivos que subes para importar transacciones.
- **Fotos de recibos**: imagenes que subes para que la IA las procese.
- **Datos de uso**: paginas visitadas, funciones utilizadas y datos tecnicos basicos (navegador, dispositivo) para mejorar el servicio.`,
      },
      {
        heading: "3. Como usamos tus datos",
        body: `Usamos tus datos exclusivamente para:

- **Prestar el servicio**: mostrarte tus transacciones, presupuestos, graficos e informes.
- **Categorizacion con IA**: analizar recibos y extractos para categorizar transacciones automaticamente.
- **Mejora del producto**: estadisticas anonimas de uso para entender que funciones son mas utiles.

Nunca vendemos tus datos a terceros. Nunca los usamos para publicidad.`,
      },
      {
        heading: "3.1 Base legal del tratamiento (RGPD art. 6)",
        body: `Procesamos tus datos amparados en las siguientes bases legales:

- **Ejecucion de contrato (art. 6.1.b)**: para prestar el servicio que contratas (mostrar tus transacciones, presupuestos, informes, autenticacion). Sin estos datos la app no puede funcionar.
- **Consentimiento (art. 6.1.a)**: para procesar con IA las fotos de recibos y extractos bancarios que tu mismo subes. Puedes retirar el consentimiento en cualquier momento dejando de usar esta funcion o solicitandolo en ${SUPPORT_EMAIL}.
- **Interes legitimo (art. 6.1.f)**: analitica anonima de uso (Vercel Analytics) para entender que funciones se usan y mejorar el producto. No hacemos profiling ni tracking publicitario. Tienes derecho de oposicion ejercitable en ${SUPPORT_EMAIL}.
- **Obligacion legal (art. 6.1.c)**: conservacion de registros de facturacion cuando existan pagos, durante los plazos exigidos por la normativa fiscal aplicable.`,
      },
      {
        heading: "4. Procesamiento con IA",
        body: `Cuando subes una foto de un recibo o extracto bancario:

- La imagen o el texto extraido del archivo se envian a **OpenAI, Inc.** (EEUU) usando su API para extraer los datos relevantes (importes, fechas, conceptos, categoria). Este procesamiento esta cubierto por el acuerdo de tratamiento de datos (DPA) de OpenAI y su politica de "no entrenar con datos de API" (zero data retention en el modelo).
- El contenido se retiene en los servidores de OpenAI un maximo de 30 dias para deteccion de abuso, segun la politica publica de OpenAI, y despues se elimina.
- Una vez procesada, la imagen no se guarda en nuestros servidores. Solo conservamos los datos extraidos (importe, fecha, concepto, categoria).
- La IA no se entrena con tus datos. Tus transacciones no se usan para mejorar ningun modelo de inteligencia artificial.`,
      },
      {
        heading: "5. Almacenamiento y seguridad",
        body: `- **Base de datos**: Neon (PostgreSQL serverless), con cifrado en reposo.
- **Hosting**: Vercel (infraestructura serverless, CDN, cron jobs).
- **Cifrado**: todos los datos sensibles se cifran con AES-256 en reposo; TLS 1.2+ en transito.
- **Contrasenas**: se almacenan como hashes seguros (bcrypt, factor 12), nunca en texto plano.
- **Sesiones**: la autenticacion usa tokens JWT firmados (HS256) guardados en una cookie httpOnly ("ft_session"). La app nativa de iOS tambien guarda el token en almacenamiento local seguro para mantener la sesion.`,
      },
      {
        heading: "6. Cookies y almacenamiento local",
        body: `- **ft_session** (cookie httpOnly): mantiene tu sesion iniciada. Estrictamente necesaria.
- **ft_token** (localStorage, solo web/app nativa): copia del token de sesion para que la app funcione offline y pueda autenticarse desde la app nativa. Estrictamente necesaria.
- **Preferencias de tema** (localStorage): guarda si prefieres tema claro u oscuro.

No usamos cookies de seguimiento, cookies de terceros ni cookies publicitarias.`,
      },
      {
        heading: "6.1 Subencargados de tratamiento",
        body: `Para prestar el servicio usamos los siguientes subencargados. Todos estan bajo acuerdo de tratamiento de datos (DPA) y, cuando procesan datos fuera del Espacio Economico Europeo, la transferencia esta cubierta por Clausulas Contractuales Tipo (SCCs) de la Comision Europea.

- **Vercel Inc.** (EEUU): hosting, CDN, logs y analitica anonima de uso (Vercel Analytics).
- **Neon Inc.** (EEUU): base de datos PostgreSQL.
- **OpenAI, Inc.** (EEUU): procesamiento de imagenes y texto para categorizacion con IA.
- **Resend Inc.** (EEUU): envio de emails transaccionales (bienvenida, resumen semanal, confirmaciones).
- **Apple Inc.** (EEUU): envio de notificaciones push a dispositivos iOS a traves de Apple Push Notification Service (APNs).
- **Ionic (Capacitor)**: framework local, no procesa datos en sus servidores.

No compartimos tus datos con ningun otro tercero.`,
      },
      {
        heading: "7. Conservacion de datos",
        body: `Conservamos tus datos mientras tu cuenta este activa. Si eliminas tu cuenta:

- Todos tus datos personales y financieros se eliminan de forma permanente.
- Puedes borrar tu cuenta tu mismo desde **Ajustes → Borrar mi cuenta** en cualquier momento. No necesitas escribirnos.
- Si prefieres contactarnos, tambien puedes solicitar la eliminacion en ${SUPPORT_EMAIL}.
- La eliminacion es inmediata en la base de datos activa y se completa en backups en un plazo maximo de 60 dias.
- Nadie en el equipo puede ver el contenido de tus transacciones en ningun momento. Solo tu, con tu contrasena.`,
      },
      {
        heading: "8. Tus derechos (RGPD)",
        body: `Como usuario en la Union Europea, tienes derecho a:

- **Acceso**: solicitar una copia de todos tus datos personales.
- **Rectificacion**: corregir datos inexactos o incompletos.
- **Supresion**: solicitar la eliminacion de tus datos ("derecho al olvido").
- **Portabilidad**: recibir tus datos en un formato estructurado y legible por maquina.
- **Oposicion**: oponerte al procesamiento de tus datos en determinadas circunstancias.
- **Limitacion**: solicitar que restrinjamos el uso de tus datos.

Puedes ejercer los derechos de **acceso** y **portabilidad** tu mismo desde **Ajustes → Exportar todos mis datos**, que descarga un JSON con todo. Para el resto, escribe a ${SUPPORT_EMAIL}. Responderemos en un plazo maximo de 30 dias.`,
      },
      {
        heading: "9. Transferencias internacionales",
        body: `Algunos de nuestros subencargados (Vercel, Neon, OpenAI, Resend, Apple) procesan datos en Estados Unidos. Estas transferencias estan protegidas por Clausulas Contractuales Tipo (SCCs) aprobadas por la Comision Europea, garantizando un nivel de proteccion equivalente al exigido por el RGPD.

Puedes consultar la lista completa y actualizada de subencargados en la seccion 6.1 de esta politica.`,
      },
      {
        heading: "10. Menores",
        body: `fintrk no esta destinado a menores de 16 anos. No recopilamos intencionadamente datos de menores de 16 anos. Si descubrimos que hemos recopilado datos de un menor, los eliminaremos inmediatamente.`,
      },
      {
        heading: "11. Cambios en esta politica",
        body: `Podemos actualizar esta politica de privacidad ocasionalmente. Cuando lo hagamos, actualizaremos la fecha de "ultima actualizacion" en la parte superior. Si los cambios son significativos, te notificaremos por email.`,
      },
      {
        heading: "12. Contacto",
        body: `Para cualquier pregunta sobre esta politica de privacidad o sobre como tratamos tus datos:

- **Email**: ${SUPPORT_EMAIL}
- **Responsable**: ${OWNER_NAME}
- **Ubicacion**: ${OWNER_LOCATION}

Si consideras que no hemos gestionado tu solicitud adecuadamente, tienes derecho a presentar una reclamacion ante la Autoriteit Persoonsgegevens (autoridad de proteccion de datos de los Paises Bajos).`,
      },
    ],
  },
  en: {
    backHome: "Back to home",
    title: "Privacy Policy",
    lastUpdated: "Last updated: April 20, 2026",
    sections: [
      {
        heading: "1. Who we are",
        body: `fintrk is a personal finance app with artificial intelligence, operated by ${OWNER_NAME}, based in ${OWNER_LOCATION}.

For any privacy or data protection inquiries, you can contact us at ${SUPPORT_EMAIL}.`,
      },
      {
        heading: "2. What data we collect",
        body: `We collect the following types of data:

- **Account data**: email and password (hashed).
- **Financial data**: transactions, categories, budgets, and goals that you enter manually or import.
- **Bank statements**: files you upload to import transactions.
- **Receipt photos**: images you upload for AI processing.
- **Usage data**: pages visited, features used, and basic technical data (browser, device) to improve the service.`,
      },
      {
        heading: "3. How we use your data",
        body: `We use your data exclusively to:

- **Provide the service**: display your transactions, budgets, charts, and reports.
- **AI categorization**: analyze receipts and statements to automatically categorize transactions.
- **Product improvement**: anonymous usage statistics to understand which features are most useful.

We never sell your data to third parties. We never use it for advertising.`,
      },
      {
        heading: "3.1 Legal basis for processing (GDPR art. 6)",
        body: `We process your data on the following legal bases:

- **Performance of a contract (art. 6.1.b)**: to deliver the service you sign up for (showing your transactions, budgets, reports, authentication). Without this data the app cannot function.
- **Consent (art. 6.1.a)**: to process receipt photos and bank statements you upload with AI. You can withdraw consent at any time by stopping use of that feature or by writing to ${SUPPORT_EMAIL}.
- **Legitimate interest (art. 6.1.f)**: anonymous usage analytics (Vercel Analytics) to understand feature usage and improve the product. We do not do profiling or ad tracking. You can object at ${SUPPORT_EMAIL}.
- **Legal obligation (art. 6.1.c)**: retention of billing records when payments exist, for the periods required by applicable tax law.`,
      },
      {
        heading: "4. AI processing",
        body: `When you upload a receipt photo or bank statement:

- The image or the text extracted from the file is sent to **OpenAI, Inc.** (USA) via its API to extract relevant data (amounts, dates, descriptions, category). This processing is covered by OpenAI's data processing agreement (DPA) and its "no training on API data" policy (zero data retention in the model).
- Content is retained on OpenAI servers for a maximum of 30 days for abuse detection, according to OpenAI's public policy, and then deleted.
- Once processed, the image is not stored on our servers. We only keep the extracted data (amount, date, description, category).
- The AI does not train on your data. Your transactions are not used to improve any AI model.`,
      },
      {
        heading: "5. Data storage and security",
        body: `- **Database**: Neon (serverless PostgreSQL), with encryption at rest.
- **Hosting**: Vercel (serverless infrastructure, CDN, cron jobs).
- **Encryption**: all sensitive data is encrypted with AES-256 at rest; TLS 1.2+ in transit.
- **Passwords**: stored as secure hashes (bcrypt, factor 12), never in plain text.
- **Sessions**: authentication uses signed JWT tokens (HS256) stored in an httpOnly cookie ("ft_session"). The iOS native app also stores the token in secure local storage to keep the session.`,
      },
      {
        heading: "6. Cookies and local storage",
        body: `- **ft_session** (httpOnly cookie): keeps you logged in. Strictly necessary.
- **ft_token** (localStorage, web/native app only): copy of the session token so the app can work offline and the native app can authenticate. Strictly necessary.
- **Theme preferences** (localStorage): stores whether you prefer light or dark mode.

We do not use tracking cookies, third-party cookies, or advertising cookies.`,
      },
      {
        heading: "6.1 Sub-processors",
        body: `To provide the service we use the following sub-processors. All are covered by a data processing agreement (DPA) and, when they process data outside the European Economic Area, the transfer is covered by Standard Contractual Clauses (SCCs) from the European Commission.

- **Vercel Inc.** (USA): hosting, CDN, logs, and anonymous usage analytics (Vercel Analytics).
- **Neon Inc.** (USA): PostgreSQL database.
- **OpenAI, Inc.** (USA): processing of images and text for AI categorization.
- **Resend Inc.** (USA): transactional email delivery (welcome, weekly recap, confirmations).
- **Apple Inc.** (USA): push notification delivery to iOS devices via Apple Push Notification Service (APNs).
- **Ionic (Capacitor)**: local framework, does not process data on its servers.

We do not share your data with any other third party.`,
      },
      {
        heading: "7. Data retention",
        body: `We retain your data as long as your account is active. If you delete your account:

- All your personal and financial data is permanently deleted.
- You can delete your account yourself from **Settings → Delete my account** at any time. You don't need to contact us.
- If you prefer to reach out, you can also request deletion at ${SUPPORT_EMAIL}.
- Deletion is immediate in the live database and completed in backups within a maximum of 60 days.
- No one on the team can see the content of your transactions at any time. Only you, with your password.`,
      },
      {
        heading: "8. Your rights (GDPR)",
        body: `As a user in the European Union, you have the right to:

- **Access**: request a copy of all your personal data.
- **Rectification**: correct inaccurate or incomplete data.
- **Erasure**: request deletion of your data ("right to be forgotten").
- **Portability**: receive your data in a structured, machine-readable format.
- **Object**: object to the processing of your data in certain circumstances.
- **Restriction**: request that we restrict the use of your data.

You can exercise **access** and **portability** rights yourself from **Settings → Export all my data**, which downloads a full JSON. For the rest, write to ${SUPPORT_EMAIL}. We will respond within a maximum of 30 days.`,
      },
      {
        heading: "9. International transfers",
        body: `Some of our sub-processors (Vercel, Neon, OpenAI, Resend, Apple) process data in the United States. These transfers are protected by Standard Contractual Clauses (SCCs) approved by the European Commission, ensuring a level of protection equivalent to what the GDPR requires.

You can find the full, up-to-date list of sub-processors in section 6.1 of this policy.`,
      },
      {
        heading: "10. Children",
        body: `fintrk is not intended for children under 16 years of age. We do not knowingly collect data from children under 16. If we discover that we have collected data from a child, we will delete it immediately.`,
      },
      {
        heading: "11. Changes to this policy",
        body: `We may update this privacy policy from time to time. When we do, we will update the "last updated" date at the top. If the changes are significant, we will notify you by email.`,
      },
      {
        heading: "12. Contact",
        body: `For any questions about this privacy policy or how we handle your data:

- **Email**: ${SUPPORT_EMAIL}
- **Controller**: ${OWNER_NAME}
- **Location**: ${OWNER_LOCATION}

If you believe we have not handled your request adequately, you have the right to file a complaint with the Autoriteit Persoonsgegevens (Dutch Data Protection Authority).`,
      },
    ],
  },
};

function renderBody(body: string) {
  const lines = body.split("\n");
  const elements: React.ReactNode[] = [];
  let key = 0;

  for (const line of lines) {
    if (line.trim() === "") {
      elements.push(<br key={key++} />);
    } else if (line.trim().startsWith("- **")) {
      const match = line.trim().match(/^- \*\*(.+?)\*\*:?\s*(.*)$/);
      if (match) {
        elements.push(
          <li key={key++} className="ml-4 list-disc">
            <strong className="text-[#1A1A1A]">{match[1]}</strong>
            {match[2] ? `: ${match[2]}` : ""}
          </li>
        );
      }
    } else if (line.trim().startsWith("- ")) {
      elements.push(
        <li key={key++} className="ml-4 list-disc">
          {line.trim().slice(2)}
        </li>
      );
    } else {
      elements.push(
        <span key={key++}>
          {line}
          {"\n"}
        </span>
      );
    }
  }

  return elements;
}

export default function PrivacyPage() {
  const [locale, setLocale] = useState<Locale>("es");
  const t = content[locale];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A] selection:bg-[#2D6A4F]/20">
      {/* Header */}
      <header className="border-b border-[#E9ECEF] bg-[#FAFAF7]/90 backdrop-blur-xl sticky top-0 z-50">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 flex items-center justify-between h-14 sm:h-16">
          <Link
            href="/"
            className="font-display font-extrabold text-lg tracking-tight"
          >
            <span className="text-[#1A1A1A]">fin</span>
            <span className="text-[#2D6A4F]">trk</span>
          </Link>

          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center bg-white rounded-full p-0.5 text-[11px] border border-[#E9ECEF]">
              {LOCALES.map((l) => (
                <button
                  key={l}
                  onClick={() => setLocale(l)}
                  aria-label={LOCALE_LABELS[l]}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-all duration-200 ${
                    locale === l
                      ? "bg-[#F7F7F5] text-[#1A1A1A]"
                      : "text-[#888888]"
                  }`}
                >
                  <CountryFlag code={LOCALE_FLAGS[l]} size={16} />
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-5 sm:px-8 py-12 sm:py-16">
        {/* Back link */}
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm text-[#888888] hover:text-[#2D6A4F] transition-colors mb-8"
        >
          <ArrowLeft size={14} />
          {t.backHome}
        </Link>

        {/* Title */}
        <h1 className="text-3xl sm:text-4xl font-display font-extrabold tracking-tight mb-2">
          {t.title}
        </h1>
        <p className="text-sm text-[#888888] mb-12">
          {t.lastUpdated}
        </p>

        {/* Sections */}
        <div className="space-y-10">
          {t.sections.map((section, i) => (
            <section key={i}>
              <h2 className="text-lg font-semibold text-[#1A1A1A] mb-3">
                {section.heading}
              </h2>
              <div className="text-sm text-[#555555] leading-relaxed whitespace-pre-line">
                {renderBody(section.body)}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-[#E9ECEF] text-center">
          <Link
            href="/"
            className="font-display font-extrabold text-lg tracking-tight"
          >
            <span className="text-[#1A1A1A]">fin</span>
            <span className="text-[#2D6A4F]">trk</span>
          </Link>
          <p className="text-xs text-[#888888] mt-2">
            {locale === "es"
              ? "\u00a9 2026 fintrk. Todos los derechos reservados."
              : "\u00a9 2026 fintrk. All rights reserved."}
          </p>
        </div>
      </main>
    </div>
  );
}

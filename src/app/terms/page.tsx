"use client";

import { useState } from "react";
import Link from "next/link";
import { CountryFlag } from "@/components/country-flag";
import { OWNER_NAME, OWNER_LOCATION, SUPPORT_EMAIL } from "@/lib/owner";

type Locale = "es" | "en";

const content = {
  es: {
    backToHome: "Volver al inicio",
    title: "Terminos de Servicio",
    lastUpdated: "Ultima actualizacion: Abril 2026",
    sections: [
      {
        title: "1. Aceptacion de los Terminos",
        body: "Al acceder o usar fintrk.app, aceptas estos Terminos de Servicio. Si no estas de acuerdo, no uses el servicio. El uso continuado despues de cualquier cambio implica la aceptacion de los terminos actualizados.",
      },
      {
        title: "2. Descripcion del Servicio",
        body: "fintrk es una aplicacion de finanzas personales que permite registrar transacciones, categorizarlas automaticamente mediante inteligencia artificial, establecer presupuestos y visualizar tus habitos financieros. El servicio esta disponible como aplicacion web y, en el futuro, como aplicacion movil.",
      },
      {
        title: "3. Registro de Cuenta",
        body: "Para usar fintrk, debes crear una cuenta. Requisitos:\n\n- Debes tener al menos 16 anos de edad.\n- Debes proporcionar informacion veraz y actualizada.\n- Eres responsable de mantener la confidencialidad de tu contrasena.\n- Eres responsable de toda la actividad que ocurra bajo tu cuenta.\n- Debes notificarnos inmediatamente si sospechas de un uso no autorizado.",
      },
      {
        title: "4. Acceso al Servicio",
        body: "La version 1.0 de fintrk se ofrece de forma gratuita. Todas las funciones disponibles en la aplicacion estan accesibles sin coste para cualquier usuario registrado. Si en futuras versiones se introducen funciones de pago, estas se implementaran exclusivamente mediante las compras integradas (In-App Purchase) de Apple en iOS, conforme a las directrices de la App Store, y los terminos correspondientes se actualizaran antes de su disponibilidad.",
      },
      {
        title: "5. Uso Aceptable",
        body: "Puedes usar fintrk unicamente para gestionar tus finanzas personales. No esta permitido:\n\n- Usar el servicio para actividades ilegales o fraudulentas.\n- Realizar scraping, crawling o extraccion automatizada de datos.\n- Intentar acceder a cuentas de otros usuarios.\n- Interferir con el funcionamiento del servicio.\n- Usar bots o herramientas automatizadas para interactuar con el servicio.\n- Revender o redistribuir el acceso al servicio.",
      },
      {
        title: "6. Propiedad Intelectual",
        body: `fintrk, incluyendo su diseno, codigo, marca y contenido, es propiedad de ${OWNER_NAME}. No se te concede ningun derecho de propiedad intelectual sobre el servicio. Tus datos financieros son y seguiran siendo tuyos.`,
      },
      {
        title: "7. Contenido del Usuario",
        body: "Tu retienes la propiedad total de los datos que subes a fintrk (transacciones, capturas de pantalla, extractos bancarios, etc.). Al usar el servicio, nos concedes una licencia limitada para procesar, almacenar y mostrar tus datos con el unico proposito de proporcionarte el servicio. No vendemos, compartimos ni usamos tus datos financieros para ningun otro fin.",
      },
      {
        title: "8. Procesamiento con IA",
        body: "fintrk utiliza inteligencia artificial para categorizar automaticamente tus transacciones y ofrecer informacion sobre tus habitos financieros. Sobre esto:\n\n- La categorizacion por IA es una sugerencia y puede contener errores.\n- Siempre debes verificar que las categorias asignadas sean correctas.\n- No garantizamos la precision al 100% del procesamiento con IA.\n- Puedes corregir manualmente cualquier categorizacion incorrecta.",
      },
      {
        title: "9. Exencion de Responsabilidad",
        body: "fintrk es una herramienta de seguimiento financiero personal. No somos asesores financieros. Importante:\n\n- fintrk no proporciona asesoramiento financiero, fiscal ni de inversiones.\n- Las categorias y analisis son informativos, no constituyen recomendaciones.\n- No somos responsables de decisiones financieras basadas en los datos mostrados.\n- El servicio se proporciona \"tal cual\" sin garantias de ningun tipo.\n- Usas el servicio bajo tu propia responsabilidad.",
      },
      {
        title: "10. Limitacion de Responsabilidad",
        body: "En la maxima medida permitida por la legislacion europea y española aplicable, nuestra responsabilidad total ante ti esta limitada al importe que hayas pagado por el servicio durante los 12 meses anteriores. No somos responsables de danos indirectos o consecuentes.\n\nNada en estos terminos limita tus derechos como consumidor bajo la legislacion de la Union Europea, incluida la Directiva 2011/83/UE sobre derechos de los consumidores.",
      },
      {
        title: "11. Terminacion",
        body: "Cualquiera de las partes puede terminar esta relacion en cualquier momento:\n\n- Tu puedes eliminar tu cuenta desde la configuración.\n- Nosotros podemos suspender o terminar tu cuenta si violas estos terminos.\n- Tras la terminacion, tus datos seran eliminados de acuerdo con nuestra Politica de Privacidad.\n- Antes de eliminar tu cuenta, puedes exportar tus datos.",
      },
      {
        title: "12. Cambios en los Terminos",
        body: "Podemos modificar estos terminos en cualquier momento. Si realizamos cambios significativos:\n\n- Te notificaremos con al menos 30 dias de antelacion por email.\n- Los cambios se indicaran con una nueva fecha de actualizacion.\n- El uso continuado del servicio tras el periodo de notificacion constituye aceptacion.",
      },
      {
        title: "13. Ley Aplicable",
        body: "Estos terminos se rigen por las leyes de los Paises Bajos. Si resides en la Union Europea, tambien te amparan las leyes de proteccion al consumidor de tu pais de residencia. Nada en estos terminos afecta tus derechos como consumidor bajo la normativa de la UE.",
      },
      {
        title: "14. Resolucion de Disputas",
        body: `En caso de cualquier disputa relacionada con estos terminos o el servicio:\n\n- Primero intentaremos resolver la cuestion de forma informal mediante comunicacion directa.\n- Si no se llega a un acuerdo en 30 dias, la disputa se sometera a los tribunales de ${OWNER_LOCATION}.`,
      },
      {
        title: "15. Divisibilidad",
        body: "Si alguna disposicion de estos terminos se considera invalida o inaplicable, las disposiciones restantes seguiran en pleno vigor y efecto.",
      },
      {
        title: "16. Contacto",
        body: `Si tienes preguntas sobre estos Terminos de Servicio, contactanos en:\n\n${SUPPORT_EMAIL}`,
      },
    ],
  },
  en: {
    backToHome: "Back to home",
    title: "Terms of Service",
    lastUpdated: "Last updated: April 2026",
    sections: [
      {
        title: "1. Acceptance of Terms",
        body: "By accessing or using fintrk.app, you agree to these Terms of Service. If you do not agree, do not use the service. Continued use after any changes implies acceptance of the updated terms.",
      },
      {
        title: "2. Description of Service",
        body: "fintrk is a personal finance application that allows you to record transactions, automatically categorize them using artificial intelligence, set budgets, and visualize your financial habits. The service is available as a web application and, in the future, as a mobile app.",
      },
      {
        title: "3. Account Registration",
        body: "To use fintrk, you must create an account. Requirements:\n\n- You must be at least 16 years old.\n- You must provide accurate and up-to-date information.\n- You are responsible for maintaining the confidentiality of your password.\n- You are responsible for all activity that occurs under your account.\n- You must notify us immediately if you suspect unauthorized use.",
      },
      {
        title: "4. Service Access",
        body: "Version 1.0 of fintrk is offered free of charge. All features available in the application are accessible to every registered user at no cost. If paid features are introduced in future versions, they will be implemented exclusively through Apple In-App Purchase on iOS, in accordance with App Store guidelines, and these terms will be updated before such features become available.",
      },
      {
        title: "5. Acceptable Use",
        body: "You may only use fintrk to manage your personal finances. The following is not permitted:\n\n- Using the service for illegal or fraudulent activities.\n- Scraping, crawling, or automated data extraction.\n- Attempting to access other users' accounts.\n- Interfering with the operation of the service.\n- Using bots or automated tools to interact with the service.\n- Reselling or redistributing access to the service.",
      },
      {
        title: "6. Intellectual Property",
        body: `fintrk, including its design, code, brand, and content, is owned by ${OWNER_NAME}. No intellectual property rights to the service are granted to you. Your financial data is and will remain yours.`,
      },
      {
        title: "7. User Content",
        body: "You retain full ownership of the data you upload to fintrk (transactions, screenshots, bank statements, etc.). By using the service, you grant us a limited license to process, store, and display your data solely for the purpose of providing the service. We do not sell, share, or use your financial data for any other purpose.",
      },
      {
        title: "8. AI Processing",
        body: "fintrk uses artificial intelligence to automatically categorize your transactions and provide insights about your financial habits. Regarding this:\n\n- AI categorization is a suggestion and may contain errors.\n- You should always verify that assigned categories are correct.\n- We do not guarantee 100% accuracy of AI processing.\n- You can manually correct any incorrect categorization.",
      },
      {
        title: "9. Disclaimers",
        body: "fintrk is a personal financial tracking tool. We are not financial advisors. Important:\n\n- fintrk does not provide financial, tax, or investment advice.\n- Categories and analyses are informational and do not constitute recommendations.\n- We are not responsible for financial decisions based on displayed data.\n- The service is provided \"as is\" without warranties of any kind.\n- You use the service at your own risk.",
      },
      {
        title: "10. Limitation of Liability",
        body: "To the maximum extent permitted by applicable European law, our total liability to you is limited to the amount you have paid for the service during the preceding 12 months. We are not liable for indirect or consequential damages.\n\nNothing in these terms limits your rights as a consumer under European Union legislation, including Directive 2011/83/EU on consumer rights.",
      },
      {
        title: "11. Termination",
        body: "Either party may terminate this relationship at any time:\n\n- You can delete your account from your settings.\n- We may suspend or terminate your account if you violate these terms.\n- Upon termination, your data will be deleted in accordance with our Privacy Policy.\n- Before deleting your account, you can export your data.",
      },
      {
        title: "12. Changes to Terms",
        body: "We may modify these terms at any time. If we make significant changes:\n\n- We will notify you at least 30 days in advance by email.\n- Changes will be indicated with a new update date.\n- Continued use of the service after the notice period constitutes acceptance.",
      },
      {
        title: "13. Governing Law",
        body: "These terms are governed by the laws of the Netherlands. If you reside in the European Union, you are also protected by the consumer protection laws of your country of residence. Nothing in these terms affects your rights as a consumer under EU regulations.",
      },
      {
        title: "14. Dispute Resolution",
        body: `In the event of any dispute related to these terms or the service:\n\n- We will first attempt to resolve the matter informally through direct communication.\n- If no agreement is reached within 30 days, the dispute will be submitted to the courts of ${OWNER_LOCATION}.`,
      },
      {
        title: "15. Severability",
        body: "If any provision of these terms is found to be invalid or unenforceable, the remaining provisions will continue in full force and effect.",
      },
      {
        title: "16. Contact",
        body: `If you have questions about these Terms of Service, contact us at:\n\n${SUPPORT_EMAIL}`,
      },
    ],
  },
};

export default function TermsPage() {
  const [locale, setLocale] = useState<Locale>("es");
  const t = content[locale];

  return (
    <div className="min-h-screen bg-[#FAFAF7] text-[#1A1A1A] selection:bg-[#2D6A4F]/20 selection:text-[#1A1A1A]">
      {/* Header */}
      <nav className="sticky top-0 z-50 bg-[#FAFAF7]/90 backdrop-blur-xl border-b border-[#E9ECEF]">
        <div className="mx-auto max-w-3xl px-5 sm:px-8 flex items-center justify-between h-14 sm:h-16">
          <Link href="/" className="flex items-center gap-1">
            <span className="font-display font-extrabold text-lg tracking-tight">
              <span className="text-[#1A1A1A]">fin</span>
              <span className="text-[#2D6A4F]">trk</span>
            </span>
          </Link>
          <div className="flex items-center gap-3">
            {/* Language toggle */}
            <div className="flex items-center bg-white rounded-full p-0.5 text-[11px] border border-[#E9ECEF]">
              <button
                onClick={() => setLocale("es")}
                aria-label="Español"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-all duration-200 ${
                  locale === "es"
                    ? "bg-[#F7F7F5] text-[#1A1A1A]"
                    : "text-[#888888]"
                }`}
              >
                <CountryFlag code="ES" size={16} />
                ES
              </button>
              <button
                onClick={() => setLocale("en")}
                aria-label="English"
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-semibold transition-all duration-200 ${
                  locale === "en"
                    ? "bg-[#F7F7F5] text-[#1A1A1A]"
                    : "text-[#888888]"
                }`}
              >
                <CountryFlag code="GB" size={16} />
                EN
              </button>
            </div>
            <Link
              href="/"
              className="text-sm text-[#888888] hover:text-[#1A1A1A] transition-colors"
            >
              {t.backToHome}
            </Link>
          </div>
        </div>
      </nav>

      {/* Content */}
      <main className="mx-auto max-w-3xl px-5 sm:px-8 py-12 sm:py-16">
        <h1 className="font-display font-extrabold text-3xl sm:text-4xl tracking-tight mb-2">
          {t.title}
        </h1>
        <p className="text-sm text-[#888888] mb-12">{t.lastUpdated}</p>

        <div className="space-y-10">
          {t.sections.map((section) => (
            <section key={section.title}>
              <h2 className="font-display font-bold text-lg sm:text-xl mb-3 text-[#1A1A1A]">
                {section.title}
              </h2>
              <div className="text-[15px] leading-relaxed text-[#444444] whitespace-pre-line">
                {section.body}
              </div>
            </section>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-16 pt-8 border-t border-[#E9ECEF] flex items-center justify-between">
          <span className="font-display font-extrabold text-sm tracking-tight">
            <span className="text-[#1A1A1A]">fin</span>
            <span className="text-[#2D6A4F]">trk</span>
          </span>
          <Link
            href="/"
            className="text-sm text-[#888888] hover:text-[#1A1A1A] transition-colors"
          >
            {t.backToHome}
          </Link>
        </div>
      </main>
    </div>
  );
}

import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Política de Privacidad — VitaZen',
  description: 'Política de privacidad de VitaZen. Información sobre cómo recopilamos, usamos y protegemos tus datos personales.',
  openGraph: {
    title: 'Política de Privacidad — VitaZen',
    description: 'Información sobre cómo recopilamos, usamos y protegemos tus datos personales en VitaZen.',
  },
};

export default function PrivacyPolicyPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="mb-12 border-b border-champagne/30 pb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-champagne mb-3">
            Política de Privacidad
          </h1>
          <p className="text-sm text-gray-400">
            Última actualización: 13 de mayo de 2026
          </p>
        </header>

        {/* Intro */}
        <section className="mb-10">
          <p className="text-gray-300 leading-relaxed">
            En VitaZen (&quot;nosotros&quot;, &quot;nuestro&quot; o &quot;la aplicación&quot;), accesible desde
            <span className="text-white font-medium"> https://vitazen.cc</span>, nos comprometemos a
            proteger la privacidad de nuestros usuarios. Esta Política de Privacidad explica qué
            información recopilamos, cómo la utilizamos, con quién la compartimos y qué derechos
            tienes respecto a tus datos personales. Al utilizar VitaZen, aceptas las prácticas
            descritas en este documento. Si no estás de acuerdo, te rogamos que no utilices
            nuestra aplicación.
          </p>
        </section>

        {/* 1. Datos que recopilamos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            1. Datos que recopilamos
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Recopilamos información necesaria para proporcionar y mejorar nuestros servicios.
            Los datos se obtienen de las siguientes fuentes:
          </p>

          <h3 className="text-lg font-medium text-white mb-2">
            a) Datos proporcionados por ti
          </h3>
          <ul className="list-disc list-outside ml-6 text-gray-300 space-y-2 mb-4">
            <li>
              <span className="text-white font-medium">Cuenta y autenticación:</span> dirección de
              correo electrónico, nombre de usuario y contraseña (almacenada de forma cifrada).
              Utilizamos proveedores de autenticación externos (como Google OAuth) cuando eliges
              iniciar sesión con ellos, en cuyo caso recibimos tu nombre, correo electrónico e
              identificador de cuenta del proveedor.
            </li>
            <li>
              <span className="text-white font-medium">Perfil personal:</span> nombre para mostrar,
              foto de perfil y preferencias de configuración que decides introducir en la aplicación.
            </li>
            <li>
              <span className="text-white font-medium">Datos de suscripción y pago:</span> cuando
              adquieres el plan Élite, procesamos la transacción a través de Stripe. No
              almacenamos números de tarjeta bancaria, CVV ni datos bancarios completos en nuestros
              servidores. Stripe nos proporciona únicamente información agregada como el estado de la
              suscripción, el periodo de facturación y un identificador de cliente seguro.
            </li>
          </ul>

          <h3 className="text-lg font-medium text-white mb-2">
            b) Datos recopilados automáticamente
          </h3>
          <ul className="list-disc list-outside ml-6 text-gray-300 space-y-2 mb-4">
            <li>
              <span className="text-white font-medium">Datos de uso:</span> registros de las
              funcionalidades que utilizas dentro de VitaZen, como módulos completados, hábitos
              registrados, sesiones de meditación o ejercicio, y métricas de progreso. Estos datos
              son esenciales para personalizar tu experiencia y mostrar tu avance.
            </li>
            <li>
              <span className="text-white font-medium">Datos del dispositivo:</span> tipo de
              dispositivo, sistema operativo, versión de la aplicación, resolución de pantalla e
              idioma configurado, recopilados con el fin de asegurar la compatibilidad y optimizar
              el rendimiento.
            </li>
            <li>
              <span className="text-white font-medium">Datos de rendimiento y errores:</span>
              información sobre fallos, tiempos de carga y excepciones técnicas, recopilada a través
              de herramientas de observabilidad para detectar y corregir problemas rápidamente.
            </li>
          </ul>

          <h3 className="text-lg font-medium text-white mb-2">
            c) Almacenamiento local y cookies
          </h3>
          <p className="text-gray-300 leading-relaxed">
            VitaZen utiliza almacenamiento local del navegador (localStorage y IndexedDB) para
            guardar preferencias de usuario, datos de sesión y contenido de uso sin conexión. Estas
            tecnologías no envían información a servidores externos por sí mismas. Además, empleamos
            cookies funcionales estrictamente necesarias para mantener la sesión activa y el
            correcto funcionamiento de la aplicación. No utilizamos cookies de seguimiento
            publicitario de terceros. Si configuras tu navegador para rechazar cookies, algunas
            funcionalidades de VitaZen podrían verse afectadas.
          </p>
        </section>

        {/* 2. Cómo utilizamos tus datos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            2. Cómo utilizamos tus datos
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Utilizamos la información recopilada con los siguientes fines:
          </p>
          <ul className="list-disc list-outside ml-6 text-gray-300 space-y-2">
            <li>
              <span className="text-white font-medium">Prestación del servicio:</span> gestionar tu
              cuenta, autenticarte, mostrar tu progreso y habilitar las funcionalidades de los cinco
              imperios (Disciplina, Mente, Energía, Finanzas y Crecimiento).
            </li>
            <li>
              <span className="text-white font-medium">Gestión de suscripciones:</span> procesar
              pagos a través de Stripe, verificar el estado de tu suscripción, enviar recordatorios
              de renovación y gestionar cancelaciones o reembolsos conforme a nuestras condiciones.
            </li>
            <li>
              <span className="text-white font-medium">Personalización:</span> adaptar el contenido,
              las recomendaciones y la interfaz a tus preferencias y hábitos de uso para ofrecerte
              una experiencia más relevante y motivadora.
            </li>
            <li>
              <span className="text-white font-medium">Comunicaciones:</span> enviarte notificaciones
              dentro de la aplicación (push notifications) relacionadas con tu progreso, recordatorios
              de hábitos y novedades del servicio. No enviaremos correos electrónicos promocionales
              sin tu consentimiento explícito.
            </li>
            <li>
              <span className="text-white font-medium">Seguridad y prevención de fraudes:</span>
              detectar accesos no autorizados, prevenir el uso indebido de cuentas y proteger la
              integridad de la plataforma frente a actividades maliciosas.
            </li>
            <li>
              <span className="text-white font-medium">Mejora continua:</span> analizar patrones de
              uso agregados y anónimos para identificar áreas de mejora, optimizar el rendimiento y
              desarrollar nuevas funcionalidades.
            </li>
          </ul>
        </section>

        {/* 3. Compartir datos con terceros */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            3. Compartir datos con terceros
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            No vendemos, alquilamos ni compartimos tus datos personales con terceros con fines
            publicitarios. Solo compartimos información en los siguientes supuestos:
          </p>
          <ul className="list-disc list-outside ml-6 text-gray-300 space-y-2">
            <li>
              <span className="text-white font-medium">Stripe:</span> proveedor de procesamiento de
              pagos. Stripe recibe los datos necesarios para completar las transacciones de
              suscripción. Su uso de datos está regido por su propia política de privacidad
              (https://stripe.com/privacy).
            </li>
            <li>
              <span className="text-white font-medium">Proveedores de autenticación:</span> cuando
              utilizas inicio de sesión con Google u otros proveedores, ellos gestionan la
              autenticación según sus propias políticas de privacidad.
            </li>
            <li>
              <span className="text-white font-medium">Infraestructura de alojamiento:</span>
              nuestros servidores están alojados en proveedores de infraestructura en la nube que
              procesan datos exclusivamente bajo nuestras instrucciones y con medidas de seguridad
              adecuadas.
            </li>
            <li>
              <span className="text-white font-medium">Obligaciones legales:</span> podremos divulgar
              información si es requerido por ley, una orden judicial o una solicitud legítima de
              una autoridad competente.
            </li>
          </ul>
        </section>

        {/* 4. Seguridad de los datos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            4. Seguridad de los datos
          </h2>
          <p className="text-gray-300 leading-relaxed">
            Implementamos medidas técnicas y organizativas para proteger tus datos personales frente
            a accesos no autorizados, pérdida, alteración o destrucción. Estas medidas incluyen
            cifrado de datos en tránsito (HTTPS/TLS), almacenamiento cifrado de contraseñas mediante
            funciones hash seguras, control de acceso basado en roles dentro de nuestra
            infraestructura, y revisiones periódicas de seguridad. A pesar de nuestros esfuerzos,
            ningún sistema es completamente invulnerable. En caso de brecha de seguridad que afecte
            a tus datos, te notificaremos de conformidad con la normativa aplicable.
          </p>
        </section>

        {/* 5. Retención de datos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            5. Retención de datos
          </h2>
          <p className="text-gray-300 leading-relaxed">
            Conservamos tus datos personales mientras mantengas una cuenta activa en VitaZen y
            durante el tiempo necesario para cumplir con las finalidades descritas en esta política.
            Si decides eliminar tu cuenta, borraremos o anonimizaremos tus datos en un plazo máximo
            de 30 días, salvo que estemos obligados a conservar cierta información por requisitos
            legales o fiscales (por ejemplo, datos de facturación durante el periodo legalmente
            requerido). Los datos de uso agregados y anónimos pueden conservarse indefinidamente con
            fines estadísticos y de mejora del servicio.
          </p>
        </section>

        {/* 6. Tus derechos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            6. Tus derechos
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            De acuerdo con la normativa vigente en materia de protección de datos (incluyendo el
            Reglamento General de Protección de Datos de la UE — RGPD), tienes los siguientes
            derechos:
          </p>
          <ul className="list-disc list-outside ml-6 text-gray-300 space-y-2">
            <li>
              <span className="text-white font-medium">Acceso:</span> solicitar una copia de los
              datos personales que tenemos sobre ti.
            </li>
            <li>
              <span className="text-white font-medium">Rectificación:</span> solicitar la corrección
              de datos inexactos o incompletos.
            </li>
            <li>
              <span className="text-white font-medium">Supresión:</span> solicitar la eliminación de
              tus datos personales (&quot;derecho al olvido&quot;).
            </li>
            <li>
              <span className="text-white font-medium">Portabilidad:</span> solicitar recibir tus
              datos en un formato estructurado y de uso común para transferirlos a otro servicio.
            </li>
            <li>
              <span className="text-white font-medium">Oposición:</span> oponerte al tratamiento de
              tus datos en determinadas circunstancias.
            </li>
            <li>
              <span className="text-white font-medium">Limitación:</span> solicitar la limitación del
              tratamiento de tus datos mientras se resuelve una reclamación.
            </li>
          </ul>
          <p className="text-gray-300 leading-relaxed mt-4">
            Para ejercer cualquiera de estos derechos, puedes contactarnos a través de
            <span className="text-white font-medium"> soportevitazen@gmail.com</span>. Responderemos a tu
            solicitud en un plazo máximo de 30 días.
          </p>
        </section>

        {/* 7. Notificaciones push */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            7. Notificaciones push
          </h2>
          <p className="text-gray-300 leading-relaxed">
            VitaZen puede enviar notificaciones push a tu dispositivo para recordarte hábitos,
            informarte de tu progreso o comunicar novedades relevantes de la aplicación. Puedes
            activar o desactivar las notificaciones en cualquier momento desde la configuración de
            tu dispositivo o desde los ajustes de la aplicación. La desactivación de las
            notificaciones no afecta al resto de funcionalidades de VitaZen.
          </p>
        </section>

        {/* 8. Aplicación para Android (TWA) */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            8. Aplicación para Android
          </h2>
          <p className="text-gray-300 leading-relaxed">
            La versión Android de VitaZen funciona como una Trusted Web Activity (TWA) que envuelve
            la aplicación web en un contenedor nativo. Esto significa que la aplicación accede al
            mismo contenido y servicios que la versión web, y esta política de privacidad aplica
            igualmente a la versión Android. La aplicación Android puede solicitar permisos para
            enviar notificaciones push. No accedemos a archivos del dispositivo, contactos,
            cámara, micrófono ni ubicación geográfica.
          </p>
        </section>

        {/* 9. Privacidad de menores */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            9. Privacidad de menores
          </h2>
          <p className="text-gray-300 leading-relaxed">
            VitaZen no está dirigido a menores de 16 años y no recopilamos conscientemente datos
            personales de menores de dicha edad. Si somos conscientes de que hemos recopilado datos
            de un menor de 16 años sin verificación del consentimiento parental, tomaremos medidas
            para eliminar esa información de nuestros servidores de forma inmediata. Si eres padre o
            tutor y crees que tu hijo ha proporcionado datos personales en VitaZen, contacta con
            nosotros en soportevitazen@gmail.com.
          </p>
        </section>

        {/* 10. Cambios en esta política */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            10. Cambios en esta política
          </h2>
          <p className="text-gray-300 leading-relaxed">
            Nos reservamos el derecho de actualizar esta Política de Privacidad en cualquier momento.
            Cualquier cambio significativo será comunicado a través de la aplicación o por correo
            electrónico. La fecha de &quot;Última actualización&quot; en la parte superior de esta página
            indica cuándo se revisó la política por última vez. Te recomendamos revisar esta página
            periódicamente para estar informado sobre cómo protegemos tu información.
          </p>
        </section>

        {/* 11. Contacto */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            11. Contacto
          </h2>
          <p className="text-gray-300 leading-relaxed">
            Si tienes preguntas, inquietudes o solicitudes relacionadas con esta Política de
            Privacidad o el tratamiento de tus datos personales, puedes contactarnos a través de:
          </p>
          <div className="mt-4 p-5 bg-white/5 border border-champagne/20 rounded-lg">
            <p className="text-white font-medium mb-2">VitaZen — Soporte</p>
            <p className="text-gray-300">
              Correo electrónico:
              <span className="text-champagne font-medium"> soportevitazen@gmail.com</span>
            </p>
            <p className="text-gray-300 mt-1">
              Sitio web:
              <span className="text-champagne font-medium"> https://vitazen.cc</span>
            </p>
          </div>
          <p className="text-gray-300 leading-relaxed mt-4">
            Responderemos a todas las consultas relacionadas con la privacidad en un plazo máximo
            de 30 días laborables, de acuerdo con la normativa aplicable.
          </p>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-champagne/20 text-center">
          <p className="text-sm text-gray-500">
            VitaZen — Ecosistema de desarrollo personal
          </p>
          <p className="text-xs text-gray-600 mt-2">
            Esta política es vinculante y aplica a todos los servicios ofrecidos en vitazen.cc
            y en la aplicación Android de VitaZen.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link
              href="/privacy"
              className="text-xs text-champagne hover:text-champagne-hover transition-colors underline underline-offset-2"
            >
              Política de Privacidad
            </Link>
            <span className="text-gray-600">|</span>
            <Link
              href="/terms"
              className="text-xs text-champagne hover:text-champagne-hover transition-colors underline underline-offset-2"
            >
              Términos y Condiciones
            </Link>
          </div>
        </footer>
      </div>
    </main>
  );
}

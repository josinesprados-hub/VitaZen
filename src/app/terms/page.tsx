import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: {
    absolute: 'Términos y Condiciones — VitaZen',
  },
  description: 'Términos y condiciones de uso de VitaZen. Condiciones generales, suscripciones, cancelaciones y responsabilidades.',
  openGraph: {
    title: 'Términos y Condiciones — VitaZen',
    description: 'Condiciones generales de uso de VitaZen, suscripciones Élite y responsabilidades.',
  },
};

export default function TermsPage() {
  return (
    <main className="min-h-screen bg-black text-white">
      <div className="max-w-3xl mx-auto px-6 py-16">
        {/* Header */}
        <header className="mb-12 border-b border-champagne/30 pb-8">
          <h1 className="text-3xl md:text-4xl font-bold text-champagne mb-3">
            Términos y Condiciones
          </h1>
          <p className="text-sm text-gray-400">
            Última actualización: 18 de mayo de 2026
          </p>
        </header>

        {/* Intro */}
        <section className="mb-10">
          <p className="text-gray-300 leading-relaxed">
            Bienvenido a VitaZen (&quot;nosotros&quot;, &quot;nuestro&quot; o &quot;la aplicación&quot;), accesible desde
            <span className="text-white font-medium"> https://vitazen.cc</span>. Estos Términos y
            Condiciones regulan el uso de nuestra aplicación y servicios. Al acceder o utilizar
            VitaZen, aceptas quedar vinculado por estos términos. Si no estás de acuerdo con
            alguno de ellos, te rogamos que no utilices la aplicación.
          </p>
        </section>

        {/* 1. Aceptación de los términos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            1. Aceptación de los términos
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Al crear una cuenta, acceder o utilizar VitaZen, confirmas que has leído, comprendido
            y aceptado estos Términos y Condiciones en su totalidad. Si utilizas VitaZen en
            representación de otra persona o entidad, declaras tener autorización para aceptar
            estos términos en su nombre.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Nos reservamos el derecho de modificar estos términos en cualquier momento. Las
            modificaciones entrarán en vigor desde su publicación en esta página. El uso
            continuado de VitaZen tras la publicación de cambios implica la aceptación de los
            nuevos términos. Si no estás de acuerdo con las modificaciones, debes dejar de
            utilizar la aplicación.
          </p>
        </section>

        {/* 2. Uso de VitaZen */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            2. Uso de VitaZen
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            VitaZen es un ecosistema de desarrollo personal basado en cinco imperios:
            Disciplina, Mente, Energía, Finanzas y Crecimiento. La aplicación ofrece
            funcionalidades como mentoría con inteligencia artificial, seguimiento de hábitos,
            meditaciones guiadas, ejercicios de respiración, desafíos diarios, análisis de
            progreso y contenido educativo.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Te comprometes a utilizar VitaZen únicamente con fines legítimos y de acuerdo con
            estos términos. No debes utilizar la aplicación de manera que pueda dañar,
            desactivar, sobrecargar o deteriorar nuestros servidores o redes, ni interferir con
            el uso y disfrute de la aplicación por parte de otros usuarios.
          </p>
          <p className="text-gray-300 leading-relaxed">
            VitaZen no está dirigido a menores de 16 años. Si eres menor de esa edad, no debes
            crear una cuenta ni utilizar la aplicación sin la supervisión y el consentimiento de
            un padre o tutor legal.
          </p>
        </section>

        {/* 3. Suscripciones Élite */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            3. Plan Élite
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            VitaZen ofrece un plan Free con funcionalidades básicas y un plan Élite de
            suscripción mensual que desbloquea acceso completo a todas las funcionalidades de
            la aplicación, incluyendo mensajes de IA ilimitados, mentor avanzado, memoria
            contextual avanzada, consejos exclusivos y contenido con más detalle en cada imperio.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Al suscribirte al plan Élite, aceptas pagar la tarifa vigente indicada en la
            página de precios de VitaZen. El precio actual es de 5€ al mes. Los precios
            incluyen los impuestos aplicables según tu ubicación. Nos reservamos el derecho de
            modificar los precios con un preaviso de al menos 30 días. Si no aceptas el nuevo
            precio, podrás cancelar tu suscripción antes de que entre en vigor.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Las funcionalidades específicas incluidas en cada plan pueden variar con el tiempo.
            Las modificaciones sustanciales en las funcionalidades del plan Élite serán
            comunicadas con antelación suficiente a través de la aplicación o por correo
            electrónico.
          </p>
        </section>

        {/* 4. Facturación y renovaciones */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            4. Facturación y renovaciones
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            La suscripción Élite se renueva automáticamente al final de cada periodo mensual.
            El pago se procesa a través de Stripe, nuestro proveedor de pagos seguro. No
            almacenamos datos bancarios ni números de tarjeta en nuestros servidores; toda la
            información de pago es gestionada directamente por Stripe conforme a las normativas
            de seguridad PCI DSS.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Al activar una suscripción, autorizas a VitaZen a cobrar el importe correspondiente
            de forma recurrente mediante el método de pago registrado. La renovación se
            procesará automáticamente en la fecha de vencimiento de cada periodo. Recibirás un
            recibo por correo electrónico tras cada cobro realizado.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Si un pago no puede ser procesado por cualquier motivo (fondos insuficientes,
            tarjeta caducada, etc.), intentaremos procesarlo de nuevo en los días siguientes. Si
            el pago continúa sin éxito, tu suscripción podrá ser suspendida hasta que se
            regularice la situación. No se aplicarán recargos adicionales por intentos de cobro
            fallidos.
          </p>
        </section>

        {/* 5. Política de cancelación */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            5. Política de cancelación
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Puedes cancelar tu suscripción Élite en cualquier momento desde la sección de
            ajustes de la aplicación o a través del portal de gestión de Stripe. La cancelación
            surtirá efecto al final del periodo de facturación actual, lo que significa que
            seguirás teniendo acceso a las funcionalidades Élite hasta que expire el periodo
            ya pagado.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            No se realizarán reembolsos parciales por periodos no utilizados dentro de un ciclo
            de facturación en curso. Por ejemplo, si cancelas a mitad de mes, conservarás el
            acceso Élite hasta el final de ese mes, pero no recibirás un reembolso
            proporcional por los días restantes.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Si consideras que ha habido un error en el cobro o una circunstancia excepcional,
            puedes contactarnos en
            <span className="text-white font-medium"> soportevitazen@gmail.com</span> y
            evaluaremos cada caso de forma individual. Cualquier reembolso aprobado se
            procesará en un plazo de 5 a 10 días laborables sobre el mismo método de pago
            utilizado originalmente.
          </p>
        </section>

        {/* 6. Responsabilidades del usuario */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            6. Responsabilidades del usuario
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Eres responsable de mantener la confidencialidad de tus credenciales de acceso y de
            todas las actividades que se realicen bajo tu cuenta. Debes notificarnos de
            inmediato cualquier uso no autorizado de tu cuenta a través de
            <span className="text-white font-medium"> soportevitazen@gmail.com</span>.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            Te comprometes a no realizar las siguientes acciones: crear cuentas falsas o
            suplantar la identidad de terceros, compartir tus credenciales de acceso con otras
            personas, utilizar la aplicación para actividades ilegales o fraudulentas, intentar
            acceder a áreas restringidas del sistema sin autorización, o manipular,
            descompilar o realizar ingeniería inversa de cualquier componente de VitaZen.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Nos reservamos el derecho de suspender o cancelar cuentas que incumplan estos
            términos, sin perjuicio de otras acciones legales que podamos emprender. En caso
            de cancelación por incumplimiento, no se realizarán reembolsos por periodos de
            suscripción no consumados.
          </p>
        </section>

        {/* 7. Descargo de bienestar y mindfulness */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            7. Descargo de bienestar y mindfulness
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            VitaZen es una herramienta de apoyo al desarrollo personal y el bienestar
            emocional. Los contenidos de la aplicación, incluyendo pero no limitado a
            meditaciones guiadas, ejercicios de respiración, consejos de mentoría y
            recomendaciones, tienen un carácter exclusivamente informativo y motivacional.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            VitaZen no sustituye en ningún caso el consejo, diagnóstico o tratamiento médico,
            psicológico o psiquiátrico profesional. No debemos interpretarse como proveedores
            de servicios de salud mental o atención médica. Si experimentas problemas de salud
            mental o emocional, te recomendamos buscar la orientación de un profesional
            cualificado.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Las interacciones con el mentor de inteligencia artificial son generadas
            automáticamente por un modelo de lenguaje y no constituyen consejo profesional de
            ningún tipo. No nos hacemos responsables de las decisiones que tomes basándote en
            las recomendaciones o contenidos proporcionados por la aplicación.
          </p>
        </section>

        {/* 8. Propiedad intelectual */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            8. Propiedad intelectual
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Todos los contenidos, diseños, textos, gráficos, interfaces, código, logotipos,
            nombres comerciales y demás elementos creativos de VitaZen son propiedad de
            VitaZen o de sus licenciantes y están protegidos por las leyes de propiedad
            intelectual e industrial aplicables.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            La suscripción Élite te otorga una licencia personal, no exclusiva,
            intransferible y revocable para acceder y utilizar los contenidos y servicios de
            VitaZen durante el periodo de suscripción activo. Esta licencia no te permite
            reproducir, distribuir, modificar, crear obras derivadas, exhibir públicamente ni
            explotar comercialmente ningún elemento de la aplicación sin autorización expresa
            por escrito.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Los datos de progreso, hábitos y reflexiones que generas como usuario son de tu
            propiedad. Puedes solicitar la descarga o eliminación de tus datos personales en
            cualquier momento, conforme a lo establecido en nuestra Política de Privacidad.
          </p>
        </section>

        {/* 9. Limitación de responsabilidad */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            9. Limitación de responsabilidad
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            VitaZen se proporciona &quot;tal cual&quot; y &quot;según disponibilidad&quot;. No garantizamos que
            la aplicación estará disponible de forma ininterrumpida, libre de errores o que
            cumplirá con tus requisitos específicos. Hacemos esfuerzos razonables para mantener
            la disponibilidad y calidad del servicio, pero no podemos garantizar un
            funcionamiento ininterrumpido.
          </p>
          <p className="text-gray-300 leading-relaxed mb-4">
            En la máxima medida permitida por la ley, VitaZen no será responsable de daños
            indirectos, incidentales, especiales, consecutivos o punitivos, incluyendo pero no
            limitado a pérdida de datos, lucro cesante, daño reputacional o costes de
            sustitución de servicios, derivados del uso o la imposibilidad de uso de la
            aplicación.
          </p>
          <p className="text-gray-300 leading-relaxed">
            Nuestra responsabilidad total hacia ti en relación con VitaZen no excederá en
            ningún caso el importe que nos hayas pagado por tu suscripción durante los seis
            meses anteriores al evento que origine la reclamación. Esta limitación no afecta
            a los derechos que la ley te reconoce como consumidor y que no pueden ser
            excluidos ni limitados.
          </p>
        </section>

        {/* 10. Referencia a privacidad */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            10. Privacidad
          </h2>
          <p className="text-gray-300 leading-relaxed">
            El tratamiento de tus datos personales se rige por nuestra{' '}
            <Link href="/privacy" className="text-champagne underline underline-offset-2 hover:text-champagne-hover transition-colors">
              Política de Privacidad
            </Link>
            , que forma parte integral de estos Términos y Condiciones. Al aceptar estos
            términos, también aceptas las prácticas de tratamiento de datos descritas en
            dicha política. Te recomendamos revisarla para comprender cómo recopilamos,
            utilizamos y protegemos tu información personal.
          </p>
        </section>

        {/* 11. Información de contacto */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            11. Información de contacto
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Si tienes preguntas, sugerencias o reclamaciones relacionadas con estos Términos y
            Condiciones o con el uso de VitaZen, puedes contactarnos a través de:
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
            Responderemos a todas las consultas relacionadas con estos términos en un plazo
            máximo de 30 días laborables.
          </p>
        </section>

        {/* 12. Actualizaciones de los términos */}
        <section className="mb-10">
          <h2 className="text-xl font-semibold text-champagne mb-4">
            12. Actualizaciones de los términos
          </h2>
          <p className="text-gray-300 leading-relaxed mb-4">
            Nos reservamos el derecho de actualizar estos Términos y Condiciones en cualquier
            momento. Los cambios significativos serán comunicados a través de la aplicación o
            por correo electrónico con una antelación mínima de 15 días antes de su entrada en
            vigor, salvo que los cambios sean requeridos por motivos legales o de seguridad, en
            cuyo caso podrán aplicarse de forma inmediata.
          </p>
          <p className="text-gray-300 leading-relaxed">
            La fecha de &quot;Última actualización&quot; en la parte superior de esta página indica
            cuándo se revisaron los términos por última vez. Te recomendamos revisar esta
            página periódicamente para estar informado sobre las condiciones vigentes. El uso
            continuado de VitaZen tras la publicación de cambios actualizados constituye la
            aceptación de los nuevos términos.
          </p>
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-champagne/20 text-center">
          <p className="text-sm text-gray-300">
            VitaZen — Ecosistema de desarrollo personal
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Estos términos son vinculantes y aplican a todos los servicios ofrecidos en vitazen.cc
            y en la aplicación Android de VitaZen.
          </p>
          <div className="flex items-center justify-center gap-4 mt-4">
            <Link
              href="/privacy"
              className="text-xs text-champagne hover:text-champagne-hover transition-colors underline underline-offset-2"
            >
              Política de Privacidad
            </Link>
            <span className="text-gray-400">|</span>
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

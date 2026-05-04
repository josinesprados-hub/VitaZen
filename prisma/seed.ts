import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Seeding database...');

  // ═══════════════════════════════════════════
  // DAILY CHALLENGES (50+)
  // ═══════════════════════════════════════════

  const challenges = [
    // DISCIPLINA (10+)
    { category: 'disciplina', title: 'Despierta antes de las 6:00', description: 'Levántate antes del amanecer y dedica los primeros 30 minutos a tu rutina matutina sin mirar el móvil.', difficulty: 'hard' },
    { category: 'disciplina', title: 'Ducha fría de 2 minutos', description: 'Termina tu ducha con 2 minutos de agua fría. Fortalece tu disciplina y resistencia mental.', difficulty: 'hard' },
    { category: 'disciplina', title: 'Cero redes sociales hasta mediodía', description: 'No abras ninguna red social durante la mañana. Usa ese tiempo para trabajar en tu objetivo principal.', difficulty: 'medium' },
    { category: 'disciplina', title: 'Completa tu tarea más difícil primero', description: 'Identifica la tarea que más evitas y hazla en la primera hora del día. Come la rana primero.', difficulty: 'medium' },
    { category: 'disciplina', title: '5 horas de trabajo profundo', description: 'Bloquea 5 horas de trabajo sin distracciones. Sin notificaciones, sin multitasking, solo enfoque.', difficulty: 'hard' },
    { category: 'disciplina', title: 'Haz tu cama en los primeros 5 minutos', description: 'Haz tu cama inmediatamente al levantarte. La primera tarea completada genera impulso para el día.', difficulty: 'easy' },
    { category: 'disciplina', title: '15 minutos de ejercicio antes de desayunar', description: 'Realiza 15 minutos de ejercicio intenso antes del desayuno. Flexiones, sentadillas, o correr.', difficulty: 'medium' },
    { category: 'disciplina', title: 'Cero quejas durante todo el día', description: 'No te quejes de nada durante 24 horas. Cada vez que quieras quejarte, transforma la queja en una solución.', difficulty: 'hard' },
    { category: 'disciplina', title: 'Planifica mañana hoy', description: 'Dedica 15 minutos antes de dormir a planificar las 3 tareas más importantes de mañana.', difficulty: 'easy' },
    { category: 'disciplina', title: 'Levántate al primer despertador', description: 'Sin posponer la alarma. Cuando suene, levántate inmediatamente. Sin excepciones.', difficulty: 'medium' },
    { category: 'disciplina', title: '2 horas sin teléfono', description: 'Deja el teléfono en otra habitación durante 2 horas de trabajo concentrado.', difficulty: 'medium' },

    // MENTALIDAD (10+)
    { category: 'mentalidad', title: 'Escribe 3 creencias limitantes', description: 'Identifica 3 creencias que te frenan y escribe un reframing positivo para cada una. Ejemplo: "No soy capaz" → "Estoy aprendiendo y mejorando cada día".', difficulty: 'medium' },
    { category: 'mentalidad', title: '10 minutos de visualización', description: 'Cierra los ojos y visualiza con detalle cómo se ve tu vida ideal en 1 año. Siente las emociones de ya haberlo logrado.', difficulty: 'easy' },
    { category: 'mentalidad', title: 'Lee 30 páginas de un libro de crecimiento', description: 'Lee al menos 30 páginas de un libro que desafíe tu forma de pensar. Toma notas de las ideas clave.', difficulty: 'medium' },
    { category: 'mentalidad', title: 'Aprende algo completamente nuevo', description: 'Dedica 45 minutos a aprender algo que no tenga nada que ver con tu trabajo actual. Amplía tu mente.', difficulty: 'medium' },
    { category: 'mentalidad', title: 'Conversación incómoda pendiente', description: 'Ten esa conversación que has estado evitando. La incomodidad temporal es mejor que el estrés permanente.', difficulty: 'hard' },
    { category: 'mentalidad', title: 'Escribe tu propósito en la vida', description: 'Define en una frase clara tu propósito. Si no puedes, dedica 30 minutos a reflexionar sobre qué te importa realmente.', difficulty: 'medium' },
    { category: 'mentalidad', title: 'Haz algo que te dé miedo', description: 'Identifica una acción que te aterra pero que te movería hacia adelante. Hazla hoy.', difficulty: 'hard' },
    { category: 'mentalidad', title: 'Practica el pensamiento inverso', description: 'En lugar de pensar cómo tener éxito, piensa cómo garantizar el fracaso. Luego invierte las respuestas.', difficulty: 'medium' },
    { category: 'mentalidad', title: 'Gratitud por 5 dificultades', description: 'Escribe 5 cosas difíciles de tu vida y encuentra el aprendizaje positivo en cada una.', difficulty: 'easy' },
    { category: 'mentalidad', title: 'Rechaza el perfeccionismo', description: 'Completa 3 tareas al 80% en lugar de buscar el 100%. Envía, publica, comparte. Hecho es mejor que perfecto.', difficulty: 'medium' },
    { category: 'mentalidad', title: 'Define tu versión futura', description: 'Escribe cómo es la persona que quieres ser en 5 años. Qué hace, qué piensa, cómo se comporta.', difficulty: 'easy' },

    // HÁBITOS (10+)
    { category: 'habitos', title: 'Rastrea todos tus hábitos hoy', description: 'Registra cada hábito que realices hoy. Lo que se mide se mejora. Usa una lista y marca cada uno.', difficulty: 'easy' },
    { category: 'habitos', title: 'Apila un hábito nuevo', description: 'Añade un hábito nuevo inmediatamente después de uno existente. Ejemplo: después de lavar los dientes, 10 sentadillas.', difficulty: 'easy' },
    { category: 'habitos', title: 'Elimina un mal hábito 24h', description: 'Elige un mal hábito y abstente completamente durante 24 horas. Identifica qué lo dispara.', difficulty: 'medium' },
    { category: 'habitos', title: 'Rutina matutina completa', description: 'Ejecuta tu rutina matutina completa sin saltarte ningún paso. Mínimo 30 minutos estructurados.', difficulty: 'medium' },
    { category: 'habitos', title: 'Ritual nocturno de desconexión', description: 'Crea y sigue un ritual de 20 minutos antes de dormir: sin pantallas, lectura, estiramientos, reflexión.', difficulty: 'easy' },
    { category: 'habitos', title: 'Bebe 3 litros de agua', description: 'Mantente hidratado durante todo el día. Bebe un vaso nada más despertar y uno antes de cada comida.', difficulty: 'easy' },
    { category: 'habitos', title: 'Camina 10,000 pasos', description: 'Alcanza los 10,000 pasos hoy. Camina mientras llamas, después de comer, o por la tarde.', difficulty: 'medium' },
    { category: 'habitos', title: 'Un día sin azúcar añadido', description: 'Evita todo azúcar añadido durante el día. Lee las etiquetas. Fruta natural está permitida.', difficulty: 'hard' },
    { category: 'habitos', title: '30 minutos de lectura', description: 'Lee durante 30 minutos ininterrumpidos antes de dormir. Libro físico o Kindle, sin pantallas.', difficulty: 'easy' },
    { category: 'habitos', title: 'Escribe antes de las 8:00 AM', description: 'Escribe al menos 500 palabras antes de las 8 de la mañana. No importa el tema, solo escribe.', difficulty: 'medium' },
    { category: 'habitos', title: 'Prepárate la noche anterior', description: 'Prepara tu ropa, comida y lista de tareas para mañana antes de acostarte.', difficulty: 'easy' },

    // PRODUCTIVIDAD (10+)
    { category: 'productividad', title: 'Técnica Pomodoro: 8 ciclos', description: 'Completa 8 ciclos de 25 minutos de enfoque con 5 minutos de descanso. 4 horas de trabajo profundo.', difficulty: 'hard' },
    { category: 'productividad', title: 'Regla de los 2 minutos', description: 'Si una tarea toma menos de 2 minutos, hazla inmediatamente. No la pospongas ni la anotes.', difficulty: 'easy' },
    { category: 'productividad', title: 'Zero inbox', description: 'Procesa todos tus emails. Responde, archiva o elimina. La bandeja debe quedar vacía.', difficulty: 'medium' },
    { category: 'productividad', title: 'Delegar o eliminar', description: 'Revisa tu lista de tareas y delega o elimina al menos 3 tareas que no requieran tu atención directa.', difficulty: 'medium' },
    { category: 'productividad', title: '3 tareas principales', description: 'Define solo 3 tareas esenciales para hoy. No añadas más hasta completar las 3.', difficulty: 'easy' },
    { category: 'productividad', title: 'Elimina 1 compromiso innecesario', description: 'Di que no a un compromiso, reunión o tarea que no aporta valor real a tu vida.', difficulty: 'medium' },
    { category: 'productividad', title: 'Audita tu tiempo', description: 'Registra exactamente cómo usas cada hora del día. Identifica tus 3 mayores desperdiciadores de tiempo.', difficulty: 'medium' },
    { category: 'productividad', title: 'Sesión de trabajo de 90 minutos', description: 'Bloquea 90 minutos de trabajo ininterrumpido en tu tarea más importante. Sin teléfono, sin email.', difficulty: 'medium' },
    { category: 'productividad', title: 'Limpia tu espacio de trabajo', description: 'Dedica 20 minutos a organizar tu escritorio, escritorio digital y archivos. El orden externo genera claridad interna.', difficulty: 'easy' },
    { category: 'productividad', title: 'Desconecta después de las 20:00', description: 'Sin trabajo después de las 8 de la noche. Tu descanso es productividad para mañana.', difficulty: 'medium' },
    { category: 'productividad', title: 'Automatiza una tarea repetitiva', description: 'Identifica una tarea que repites a diario y busca una forma de automatizarla o simplificarla.', difficulty: 'medium' },

    // SALUD (10+)
    { category: 'salud', title: '20 minutos de ejercicio cardiovascular', description: 'Corre, nada, o pedalea durante 20 minutos a intensidad moderada-alta. Eleva tu frecuencia cardíaca.', difficulty: 'medium' },
    { category: 'salud', title: 'Sesión de estiramientos de 15 minutos', description: 'Dedica 15 minutos a estirar todo el cuerpo. Enfócate en caderas, hombros y espalda.', difficulty: 'easy' },
    { category: 'salud', title: 'Día sin procesados', description: 'Come solo alimentos integrales y naturales. Nada ultraprocesado durante todo el día.', difficulty: 'hard' },
    { category: 'salud', title: '5 minutos de respiración consciente', description: 'Practica respiración diafragmática durante 5 minutos. 4 segundos inhalar, 7 retener, 8 exhalar.', difficulty: 'easy' },
    { category: 'salud', title: '8 horas de sueño', description: 'Acuéstate lo suficientemente temprano para dormir 8 horas completas. El sueño es la base de todo.', difficulty: 'medium' },
    { category: 'salud', title: 'Prepara 3 comidas saludables', description: 'Cocina desayuno, almuerzo y cena con ingredientes reales. Sin comida rápida ni delivery.', difficulty: 'medium' },
    { category: 'salud', title: '30 minutos al aire libre', description: 'Pasa al menos 30 minutos al aire libre. Camina, siéntate en un parque, o simplemente respira aire fresco.', difficulty: 'easy' },
    { category: 'salud', title: '5 minutos de movilidad articular', description: 'Realiza círculos con todas las articulaciones: cuello, hombros, caderas, rodillas, tobillos, muñecas.', difficulty: 'easy' },
    { category: 'salud', title: 'Desintoxicación digital nocturna', description: 'Apaga todas las pantallas 1 hora antes de dormir. Lee, estira, o medita en su lugar.', difficulty: 'medium' },
    { category: 'salud', title: 'Toma el sol 15 minutos', description: 'Exponte al sol de la mañana durante 15 minutos sin protección solar. Regula tu reloj circadiano.', difficulty: 'easy' },
    { category: 'salud', title: '3 series de 20 sentadillas', description: 'Haz 60 sentadillas a lo largo del día. Puedes dividirlas en 3 series de 20.', difficulty: 'medium' },
  ];

  for (const challenge of challenges) {
    await prisma.dailyChallenge.upsert({
      where: { id: `${challenge.category}-${challenge.title.slice(0, 20).replace(/\s+/g, '-')}` },
      update: challenge,
      create: { id: `${challenge.category}-${challenge.title.slice(0, 20).replace(/\s+/g, '-')}`, ...challenge },
    });
  }

  console.log(`Created ${challenges.length} daily challenges`);

  // ═══════════════════════════════════════════
  // EMPIRE TIPS
  // ═══════════════════════════════════════════

  const tips = [
    // DISCIPLINA
    { empire: 'disciplina', title: 'La regla de los 2 días', content: 'Nunca te saltes un hábito dos días seguidos. Un día perdido es un accidente; dos es el inicio de una nueva costumbre.', plan: 'FREE' },
    { empire: 'disciplina', title: 'Stacking de hábitos', content: 'Ancla cada nuevo hábito a uno que ya haces automáticamente. "Después de [hábito existente], haré [nuevo hábito]".', plan: 'FREE' },
    { empire: 'disciplina', title: 'El poder del compromiso público', content: 'Declara tu meta ante alguien que te importa. El compromiso social aumenta la probabilidad de éxito en un 65%.', plan: 'PREMIUM' },
    { empire: 'disciplina', title: 'Diseña tu entorno', content: 'Modifica tu entorno para que el buen comportamiento sea fácil y el malo difícil. Pon el libro en la mesa de noche y el teléfono en otra habitación.', plan: 'PREMIUM' },

    // MENTE
    { empire: 'mente', title: 'Respiración 4-7-8', content: 'Inhala 4 segundos, retén 7, exhala 8. Esta técnica activa el sistema nervioso parasimpático y reduce la ansiedad en minutos.', plan: 'FREE' },
    { empire: 'mente', title: 'Micro-meditación', content: 'No necesitas 30 minutos. 3 minutos de atención plena consciente, 3 veces al día, transforman tu relación con el estrés.', plan: 'FREE' },
    { empire: 'mente', title: 'Journaling de sombra', content: 'Escribe sobre los pensamientos que juzgas en ti. La integración de tu sombra es la puerta a la auténtica transformación personal.', plan: 'PREMIUM' },
    { empire: 'mente', title: 'Reprogramación de creencias', content: 'Identifica una creencia limitante, escribe su origen, cuestiona su veracidad y reemplázala con una creencia potenciadora respaldada por evidencia.', plan: 'PREMIUM' },

    // ENERGÍA
    { empire: 'energia', title: 'Hidratación estratégica', content: 'Bebe 500ml de agua al despertar. Tu cuerpo pierde 1 litro durante la noche. La deshidratación reduce tu energía un 25%.', plan: 'FREE' },
    { empire: 'energia', title: 'Movimiento cada 60 minutos', content: 'Levántate y muévete durante 5 minutos cada hora. El sedentarismo prolongado reduce la producción de energía celular.', plan: 'FREE' },
    { empire: 'energia', title: 'Nutrición para rendimiento', content: 'Prioriza proteína en el desayuno (30g mínimo). Estabiliza la glucosa y elimina los picos de energía seguidos de caídas.', plan: 'PREMIUM' },
    { empire: 'energia', title: 'Optimización del sueño', content: 'Mantén tu habitación a 18-20°C, completamente oscura, y sin pantallas 90 minutos antes de dormir. El sueño es el pilar de la energía.', plan: 'PREMIUM' },

    // RIQUEZA
    { empire: 'riqueza', title: 'La regla del pago a ti mismo', content: 'Destina al menos el 10% de cada ingreso a ahorro o inversión antes de cualquier otro gasto. Págate primero.', plan: 'FREE' },
    { empire: 'riqueza', title: 'Auditoría de suscripciones', content: 'Revisa todas tus suscripciones mensuales. Elimina las que no usas activamente. El dinero ahorrado es dinero invertido.', plan: 'FREE' },
    { empire: 'riqueza', title: 'El presupuesto 50/30/20', content: '50% necesidades, 30% deseos, 20% ahorro/inversión. Esta simple regla transforma tu relación con el dinero sin sentir privación.', plan: 'PREMIUM' },
    { empire: 'riqueza', title: 'Fondo de emergencia primero', content: 'Antes de invertir, acumula 3-6 meses de gastos en un fondo de emergencia. La seguridad financiera es la base de la libertad.', plan: 'PREMIUM' },

    // CRECIMIENTO
    { empire: 'crecimiento', title: 'Reflexión semanal', content: 'Dedica 30 minutos cada domingo a revisar la semana: qué aprendiste, qué mejorarías, qué celebras. La reflexión convierte experiencia en sabiduría.', plan: 'FREE' },
    { empire: 'crecimiento', title: 'La pregunta poderosa', content: 'Cada mañana pregúntate: "Si hoy fuera el único día que importara, ¿qué haría diferente?" La respuesta revela tus verdaderas prioridades.', plan: 'FREE' },
    { empire: 'crecimiento', title: 'Mapa de identidad', content: 'Define quién quieres ser, no solo qué quieres lograr. Las metas sin identidad son deseos. La identidad sin metas es fantasía.', plan: 'PREMIUM' },
    { empire: 'crecimiento', title: 'Sistema de mentores', content: 'Identifica 3 personas que ya están donde tú quieres estar. Estudia sus patrones, decisiones y mentalidad. Modela lo que funciona.', plan: 'PREMIUM' },
  ];

  for (const tip of tips) {
    await prisma.empireTip.create({ data: tip });
  }

  console.log(`Created ${tips.length} empire tips`);
  console.log('Seeding complete!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

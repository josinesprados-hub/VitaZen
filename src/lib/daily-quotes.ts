// ═══════════════════════════════════════════
// VITAZEN — Daily Quotes Engine: Data Layer
// ═══════════════════════════════════════════
//
// Pure data + types. No DB. No server. No client.
// Just the quote collection and its type definitions.
//
// 495 quotes — the expanded VitaZen editorial collection.
// 295 original + 100 new premium (FASE 8.6) + 100 new premium (FASE 8.7).
// 5 originals removed in FASE 8.6.2 (editorial de-duplication).
//
// ─── ARCHITECTURE CONTRACT ────────────────
// To add new quotes in the future:
//   1. Add entries to the DAILY_QUOTES array below
//   2. That's it. No logic changes. No migration.
//
// The engine uses DAILY_QUOTES.length dynamically.
// New quotes join the next rotation cycle automatically.
// Ongoing cycles are never disrupted — the engine stores
// the collection length at cycle start and only uses
// that length until the cycle completes.
// ═══════════════════════════════════════════

// ─── Types ───

export interface DailyQuote {
  /** The quote text — original, never a real citation */
  text: string;
}

export interface DailyQuoteState {
  /** Current position in the shuffled cycle (0-based) */
  currentIndex: number;
  /** Which cycle we're on (0, 1, 2, ...) — used as deterministic shuffle seed */
  cycleNumber: number;
  /** Date key (YYYY-MM-DD) of the last quote change */
  lastDateKey: string;
  /** Length of DAILY_QUOTES when this cycle started.
   *  Prevents adding new quotes from disrupting an ongoing cycle. */
  collectionLength: number;
}

// ─── Definitive Collection ────────────────
// 295 original (post 8.6.2) + 100 new (8.6) + 100 new (8.7) = 495 total.
// VitaZen editorial voice.

export const DAILY_QUOTES: readonly DailyQuote[] = [
  // ═══════════════════════════════════════════
  // 295 FRASES ORIGINALES (5 eliminadas en FASE 8.6.2)
  // ═══════════════════════════════════════════
  { text: 'La claridad llega cuando dejas de buscarla.' },
  { text: 'No hace falta correr cuando sabes adónde vas.' },
  { text: 'El orden exterior empieza por el interior.' },
  { text: 'Lo que haces hoy habla más que lo que planeas.' },
  { text: 'Descansar no es rendirse. Es parte del camino.' },
  { text: 'Una decisión pequeña puede cambiar la dirección de todo.' },
  { text: 'El ruido impide escuchar lo que ya sabes.' },
  { text: 'La paciencia no es espera. Es confianza en el proceso.' },
  { text: 'No necesitas más información. Necesitas más acción.' },
  { text: 'El hábito es la forma que toma la intención.' },
  { text: 'Hay silencios que enseñan más que cualquier palabra.' },
  { text: 'Lo que evitas crece. Lo que miras pierde poder.' },
  { text: 'La consistencia vence al talento cuando el talento no es constante.' },
  { text: 'El tiempo no perdona la indecisión.' },
  { text: 'Aprender es reconocer lo que no sabías que ignorabas.' },
  { text: 'Las relaciones crecen donde hay presencia real.' },
  { text: 'Cada vez que dices que no a algo, dices que sí a otra cosa.' },
  { text: 'El propósito no se encuentra. Se construye.' },
  { text: 'Respirar con atención ya es un acto de resistencia.' },
  { text: 'La calma no es ausencia de problemas. Es forma de enfrentarlos.' },
  { text: 'El foco decide lo que crece en tu vida.' },
  { text: 'La responsabilidad empieza donde termina la excusa.' },
  { text: 'Lo que no se practica se olvida.' },
  { text: 'El descanso es productivo cuando es consciente.' },
  { text: 'No todo lo que importa es urgente.' },
  { text: 'La disciplina es libertad disfrazada de rutina.' },
  { text: 'Poner límites es un acto de cuidado propio.' },
  { text: 'El crecimiento duele antes de que se note.' },
  { text: 'Lo sencillo suele ser lo más difícil de mantener.' },
  { text: 'No necesitas tener razón. Necesitas estar presente.' },
  { text: 'La atención es la forma más honesta de respeto.' },
  { text: 'Hacer menos pero con más presencia cambia todo.' },
  { text: 'El miedo no desaparece. Se aprende a caminar con él.' },
  { text: 'Lo que hoy cuesta mañana será natural.' },
  { text: 'No se trata de ir rápido. Se trata de no parar.' },
  { text: 'La resiliencia se construye en los días ordinarios.' },
  { text: 'Hay momentos en los que no hacer nada es lo más inteligente.' },
  { text: 'La mejor decisión suele ser la menos cómoda.' },
  { text: 'Lo que no mides tiende a desaparecer.' },
  { text: 'El tiempo revela lo que la prisa oculta.' },
  { text: 'Un solo paso ya es movimiento.' },
  { text: 'Aprender a soltar es parte de avanzar.' },
  { text: 'La rutina no es prisión. Es estructura para la libertad.' },
  { text: 'Donde pones la atención, ahí crece tu vida.' },
  { text: 'No hay crecimiento sin incomodidad.' },
  { text: 'El hábito transforma la intención en realidad.' },
  { text: 'Preguntarse bien vale más que responder rápido.' },
  { text: 'La verdadera fuerza no hace ruido.' },
  { text: 'Cada día que eliges, estás creando quién eres.' },
  { text: 'El descanso sin culpa recupera más energía.' },
  { text: 'Las palabras que te dices a ti mismo importan.' },
  { text: 'No se necesita coraje para empezar. Se necesita para continuar.' },
  { text: 'La paciencia bien entendida es acción sostenida.' },
  { text: 'Lo que respetas te sostiene.' },
  { text: 'La disciplina no castiga. Protege.' },
  { text: 'Hay una diferencia entre estar ocupado y estar avanzando.' },
  { text: 'Lo esencial casi nunca es urgente.' },
  { text: 'El cambio real empieza en lo invisible.' },
  { text: 'No se trata de hacer más. Se trata de hacer lo que importa.' },
  { text: 'La calma es una decisión que se toma cada mañana.' },
  { text: 'Quien respeta su tiempo respeta su vida.' },
  { text: 'Las pequeñas decisiones diarias construyen el destino.' },
  { text: 'Escuchar es un acto de generosidad.' },
  { text: 'No hay progreso sin honestidad consigo mismo.' },
  { text: 'La resistencia revela lo que necesita atención.' },
  { text: 'Lo que parece lento a veces es lo más sólido.' },
  { text: 'El hábito es el puente entre querer y ser.' },
  { text: 'Elegir es renunciar. Y eso está bien.' },
  { text: 'La presencia transforma cualquier conversación.' },
  { text: 'Lo que hoy es difícil mañana será referencia.' },
  { text: 'La constancia no es espectacular. Pero funciona.' },
  { text: 'El silencio interior es un recurso escaso.' },
  { text: 'No necesitas ser perfecto. Necesitas ser honesto.' },
  { text: 'Cada vez que vuelves a empezar, sabes más.' },
  { text: 'El orden es una forma de respeto por uno mismo.' },
  { text: 'La verdadera disciplina es hacer lo necesario sin negociar.' },
  { text: 'Hay un momento en que parar es avanzar.' },
  { text: 'Lo que no se nombra no se resuelve.' },
  { text: 'La paciencia con uno mismo es la base de todo crecimiento.' },
  { text: 'El foco no es hacer una cosa. Es dejar de hacer las demás.' },
  { text: 'Aceptar lo que no puedes cambiar no es rendirse.' },
  { text: 'Lo simple exige más madurez que lo complejo.' },
  { text: 'El aprendizaje verdadero cambia cómo ves el mundo.' },
  { text: 'No subestimes lo que una hora de atención puede hacer.' },
  { text: 'La libertad está en elegir con qué comprometerse.' },
  { text: 'La rutina bien diseñada es un acto de amor propio.' },
  { text: 'Cada interrupción es una elección disfrazada.' },
  { text: 'Lo que se hace con atención se hace mejor.' },
  { text: 'La resistencia interna miente. Dice que no puedes cuando solo no quieres.' },
  { text: 'El descanso planeado es más efectivo que el agotamiento.' },
  { text: 'Quien respeta sus pausas dura más.' },
  { text: 'No confundas movimiento con dirección.' },
  { text: 'La coherencia entre lo que piensas y lo que haces es poder.' },
  { text: 'El tiempo invertido en entender ahorra el tiempo gastado en repetir.' },
  { text: 'La humildad no es debilidad. Es precisión.' },
  { text: 'Hay más fuerza en la contención que en la explosión.' },
  { text: 'Lo que practicas cada día se convierte en ti.' },
  { text: 'La mejor versión de ti no es una meta. Es una dirección.' },
  { text: 'Las excusas alivian pero no resuelven.' },
  { text: 'El coraje se demuestra cuando nadie aplaude.' },
  { text: 'Hay decisiones que solo tú puedes tomar.' },
  { text: 'Lo que parece insoportable hoy será manejable mañana.' },
  { text: 'La atención plena no es técnica. Es forma de vivir.' },
  { text: 'No esperes a tener seguridad. La seguridad viene después de actuar.' },
  { text: 'El hábito es el lenguaje del compromiso.' },
  { text: 'La relación más importante es la que tienes contigo mismo.' },
  { text: 'Cada mañana es una invitación a elegir de nuevo.' },
  { text: 'La disciplina personal no se negocia con la circunstancia.' },
  { text: 'Lo que dejas de hacer define tanto como lo que haces.' },
  { text: 'El crecimiento no es lineal. Pero siempre es posible.' },
  { text: 'La paciencia no es pasividad. Es confianza activa.' },
  { text: 'No necesitas permiso para empezar.' },
  { text: 'Las personas que te rodean influyen más de lo que crees.' },
  { text: 'El foco se entrena. No se espera.' },
  { text: 'Aprender a esperar sin desesperarse es una habilidad.' },
  { text: 'La incomodidad enseña. La comodidad estanca.' },
  { text: 'La serenidad se practica, no se busca.' },
  { text: 'No hay vergüenza en empezar de cero.' },
  { text: 'El tiempo no se gestiona. Se prioriza.' },
  { text: 'Lo que importa rara vez es cómodo.' },
  { text: 'La resiliencia no es resistencia. Es adaptación.' },
  { text: 'Elegir con calma evita rectificar con prisa.' },
  { text: 'La responsabilidad no es carga. Es poder.' },
  { text: 'Cada intento cuenta, incluso el que falla.' },
  { text: 'Lo que se hace en silencio suele tener más peso.' },
  { text: 'El descanso es parte del trabajo, no su opuesto.' },
  { text: 'No necesitas sentirte motivado para actuar con coherencia.' },
  { text: 'La madurez es elegir lo importante sobre lo urgente.' },
  { text: 'Lo que hoy te parece imposible fue algo que no habías intentado.' },
  { text: 'El mejor hábito es el que sostiene a los demás.' },
  { text: 'La presencia sincera cura más que cualquier consejo.' },
  { text: 'Quien cuida sus pensamientos cuida su vida.' },
  { text: 'No hay avance sin algún nivel de incomodidad.' },
  { text: 'La gratitud no cambia las circunstancias. Cambia cómo las ves.' },
  { text: 'El orden en el espacio refleja el orden en la mente.' },
  { text: 'Las palabras correctas llegan cuando se escucha de verdad.' },
  { text: 'Hacer lo difícil primero libera el resto del día.' },
  { text: 'Lo que parece interrupción a veces es redirección.' },
  { text: 'La constancia silenciosa supera al esfuerzo intermitente.' },
  { text: 'No hay que entender todo para seguir adelante.' },
  { text: 'El aprendizaje continuo es la mejor inversión.' },
  { text: 'La honestidad contigo mismo es el primer paso de todo cambio.' },
  { text: 'Lo que no se comparte se pudre.' },
  { text: 'Quien te escucha sin juzgar te da algo valioso.' },
  { text: 'La disciplina protege lo que la motivación no puede sostener.' },
  { text: 'El cansancio a veces es el cuerpo pidiendo sentido, no descanso.' },
  { text: 'Quien sabe esperar sabe cuándo actuar.' },
  { text: 'No confundas estar solo con estar perdido.' },
  { text: 'La calidad de tu día depende de tus primeras decisiones.' },
  { text: 'Lo que no se planifica se improvisa mal.' },
  { text: 'La calma interior no depende de las circunstancias exteriores.' },
  { text: 'El enfoque no es intensidad. Es eliminación.' },
  { text: 'Aprender a decir no es aprender a decir sí a lo que importa.' },
  { text: 'La paciencia con el proceso separa quienes logran de quienes abandonan.' },
  { text: 'Lo que se hace cada día importa más que lo que se hace una vez.' },
  { text: 'La fortaleza no se demuestra. Se vive.' },
  { text: 'El silencio bien usado es más poderoso que cualquier discurso.' },
  { text: 'No necesitas ver todo el camino. Solo el siguiente paso.' },
  { text: 'La disciplina que empieza por la mañana gobierna el día.' },
  { text: 'Lo que se acepta se transforma.' },
  { text: 'La atención a los detalles distingue lo mediocre de lo excelente.' },
  { text: 'Cada pequeño avance merece ser reconocido.' },
  { text: 'El propósito claro simplifica las decisiones.' },
  { text: 'La resiliencia se forja cuando nadie está mirando.' },
  { text: 'No hay fracaso real mientras aprendas algo.' },
  { text: 'Lo que te define no es lo que te pasa sino cómo respondes.' },
  { text: 'La coherencia entre palabras y acciones construye confianza.' },
  { text: 'La quietud no es inacción. Es preparación.' },
  { text: 'Quien se conoce a sí mismo no necesita aprobación.' },
  { text: 'Lo que parece pérdida a veces es liberación.' },
  { text: 'La disciplina cotidiana compone más que el talento excepcional.' },
  { text: 'El descanso merecido sabe mejor que el descanso robado.' },
  { text: 'No hay atrevimiento sin vulnerabilidad.' },
  { text: 'La simplicidad en la acción revela claridad en el pensamiento.' },
  { text: 'Lo que importa de verdad no compite por tu atención.' },
  { text: 'Cada vez que eliges con consciencia, tu vida se afina.' },
  { text: 'No necesitas más herramientas. Necesitas más práctica.' },
  { text: 'El hábito es la memoria del cuerpo.' },
  { text: 'La calma se cultiva. No se encuentra.' },
  { text: 'Lo que no se revisa se deteriora.' },
  { text: 'La presencia es el regalo más escaso hoy.' },
  { text: 'Quien respeta sus propios límites los expande.' },
  { text: 'El cambio no necesita ser dramático para ser real.' },
  { text: 'La atención es la moneda más valiosa que tienes.' },
  { text: 'No subestimes el poder de una rutina bien cuidada.' },
  { text: 'Lo que se hace con intención resuena más tiempo.' },
  { text: 'La voluntad de cambiar es más rara que el talento.' },
  { text: 'El mejor aprendizaje viene de la experiencia propia.' },
  { text: 'La disciplina no necesita audiencia.' },
  { text: 'Cada decisión pequeña es un voto por quién quieres ser.' },
  { text: 'Lo visible es resultado de lo invisible.' },
  { text: 'La paciencia con el resultado no es paciencia con el esfuerzo.' },

  { text: 'Quien no se permite pausar no se permite pensar.' },
  { text: 'La honestidad radical consigo mismo es liberadora.' },
  { text: 'Lo que se construye con paciencia resiste las tormentas.' },
  { text: 'La rutina es el lienzo donde se pinta la libertad.' },
  { text: 'El foco es la habilidad de elegir lo mejor frente a lo bueno.' },
  { text: 'La resiliencia nace de la confianza en que habrá un después.' },
  { text: 'No necesitas ser el mejor. Necesitas ser constante.' },
  { text: 'La madurez se nota en lo que dejas de discutir.' },
  { text: 'Lo que hoy es disciplina mañana será naturaleza.' },
  { text: 'La verdadera presencia no se practica. Se elige.' },
  { text: 'Cada persona que te reta te ofrece una oportunidad de crecer.' },
  { text: 'El orden personal no es obsesión. Es cuidado.' },
  { text: 'La calma en medio del caos es una decisión consciente.' },
  { text: 'Lo que se escribe se clarifica. Lo que se piensa se difumina.' },
  { text: 'La responsabilidad de tu vida no la tiene nadie más.' },
  { text: 'No hay vergüenza en pedir ayuda. La hay en no intentarlo.' },
  { text: 'El tiempo dedicado a pensar ahorra el tiempo perdido en rectificar.' },
  { text: 'La consistencia transforma lo ordinario en extraordinario.' },
  { text: 'Lo que no se practica con regularidad se pierde.' },
  { text: 'La disciplina conecta lo que quieres con lo que haces.' },
  { text: 'El descanso inteligente es parte del rendimiento.' },
  { text: 'No necesitas cambiar todo de golpe. Solo la próxima decisión.' },
  { text: 'La paciencia no es esperar. Es trabajar sin prisa por resultados.' },
  { text: 'Lo que se hace en los momentos difíciles revela el carácter.' },
  { text: 'La atención a lo esencial elimina lo superfluo.' },
  { text: 'Cada amanecer trae una elección que no tuviste ayer.' },
  { text: 'El crecimiento personal no compite con nadie.' },
  { text: 'La claridad de propósito elimina la confusión de acción.' },
  { text: 'Lo que se construye despacio dura más.' },
  { text: 'La libertad es elegir lo que te comprometes a cuidar.' },
  { text: 'El hábito positivo es la mejor herencia que te puedes dar.' },
  { text: 'No hay progreso sin algún nivel de renuncia.' },
  { text: 'La serenidad no se hereda. Se entrena.' },
  { text: 'Lo que te molesta de los demás te enseña sobre ti.' },
  { text: 'La disciplina en lo pequeño prepara para lo grande.' },
  { text: 'El cansancio mental se cura haciendo algo con sentido.' },
  { text: 'No necesitas un plan perfecto. Necesitas un primer paso honesto.' },
  { text: 'La constancia es el talento que todos pueden desarrollar.' },
  { text: 'Lo que parece simple a menudo es lo más profundo.' },
  { text: 'La resiliencia no es resistir. Es rehacerse.' },
  { text: 'El silencio después del esfuerzo es la mejor recompensa.' },
  { text: 'No esperes a sentirte preparado. La preparación viene haciendo.' },
  { text: 'La paciencia con los demás empieza por la paciencia contigo.' },
  { text: 'Lo que decides no hacer es tan importante como lo que decides hacer.' },
  { text: 'La atención plena transforma lo ordinario en significativo.' },
  { text: 'Cada conversación honesta acerca un poco más.' },
  { text: 'La disciplina diaria es la forma más silenciosa de ambición.' },
  { text: 'Lo que se hace con cuidado se nota desde lejos.' },
  { text: 'La calma después de la tormenta también se prepara antes.' },
  { text: 'El enfoque claro es el antídoto contra la dispersión.' },
  { text: 'No confundas la pausa con el abandono.' },

  { text: 'Lo que no se valora se pierde.' },
  { text: 'La rutina bien vivida es el secreto mejor guardado.' },
  { text: 'El aprendizaje constante es la mejor defensa contra la irrelevancia.' },
  { text: 'La honestidad consigo mismo es dolorosa pero necesaria.' },
  { text: 'No necesitas más tiempo. Necesitas más decisión.' },
  { text: 'La consistencia en lo esencial supera la intensidad en lo casual.' },
  { text: 'Lo que parece sacrificio hoy será gratitud mañana.' },
  { text: 'La serenidad no es ausencia de problemas. Es presencia de claridad.' },
  { text: 'Cada día que no retrocedes ya es un avance.' },
  { text: 'El orden mental empieza por el orden en lo físico.' },
  { text: 'La paciencia activa trabaja mientras espera.' },
  { text: 'Lo que se decide con calma se mantiene con facilidad.' },
  { text: 'La disciplina no es limitación. Es dirección.' },
  { text: 'El descanso merecido no necesita justificación.' },
  { text: 'No subestimes el efecto acumulativo de las pequeñas acciones.' },
  { text: 'La atención bien dirigida resuelve lo que la prisa complica.' },
  { text: 'Lo que te define no es la caída sino cómo te levantas.' },
  { text: 'La presencia genuina no tiene atajos.' },
  { text: 'El crecimiento real casi nunca es visible desde fuera.' },
  { text: 'La coherencia interior genera paz exterior.' },
  { text: 'Lo que se practica con intención se convierte en maestría.' },

  { text: 'La constancia en lo pequeño construye lo grande.' },
  { text: 'La calma se pierde cuando se confunde urgencia con importancia.' },
  { text: 'Lo que no se habla se agranda.' },
  { text: 'La disciplina personal es la base de toda libertad real.' },

  { text: 'La paciencia con el proceso transforma la ansiedad en confianza.' },
  { text: 'Lo que se construye con honestidad no necesita defensa.' },
  { text: 'La atención es la puerta entre tu intención y tu acción.' },
  { text: 'Cada persona que te escucha merece que hables con verdad.' },
  { text: 'El descanso es tan importante como el esfuerzo.' },
  { text: 'No hay vergüenza en ir despacio si vas en la dirección correcta.' },
  { text: 'La resiliencia no se aprende en la comodidad.' },
  { text: 'Lo que se elige con consciencia no se lamenta después.' },
  { text: 'La disciplina es la forma más práctica de amor propio.' },
  { text: 'No esperes las condiciones perfectas. Crea las condiciones posibles.' },
  { text: 'La claridad interior es la brújula más fiable.' },
  { text: 'Lo que no se cuida se deteriora en silencio.' },
  { text: 'La constancia supera a la perfección en casi todo.' },
  { text: 'El propósito claro elimina la necesidad de motivación.' },
  { text: 'La calma no se impone. Se cultiva.' },
  { text: 'No necesitas hacer más. Necesitas hacer lo que importa con más presencia.' },

  { text: 'Lo que se hace con gracia se siente ligero.' },
  { text: 'La vida que tienes es la que estás construyendo con tus decisiones de hoy.' },
  { text: 'Quien no ordena su día deja que el azar lo ordene.' },
  { text: 'El descanso es tan disciplina como el trabajo.' },
  { text: 'Las palabras innecesarias pesan más que el silencio.' },
  { text: 'La paciencia no aplaza el resultado. Lo asegura.' },
  { text: 'Cada hábito que mantienes refuerza quién estás siendo.' },
  { text: 'No se necesita voluntad para lo que ya es costumbre.' },
  { text: 'La paciencia bien practicada no es espera. Es preparación.' },
  { text: 'Lo que se hace cuando nadie ve muestra quién se es de verdad.' },
  { text: 'La serenidad ante lo imprevisto es la señal de un interior sólido.' },

  // ═══════════════════════════════════════════
  // 100 FRASES NUEVAS — FASE 8.6
  // Colección Premium VitaZen
  // Clasificación por Imperios:
  //   Disciplina: 1-20
  //   Mente: 21-40
  //   Energía: 41-60
  //   Finanzas: 61-80
  //   Crecimiento: 81-100
  // ═══════════════════════════════════════════

  // ─── DISCIPLINA (20 frases) ───
  { text: 'La diferencia entre un día cualquiera y un día que cuenta está en lo que decides antes de desayunar.' },
  { text: 'Un hábito sostenido durante un año transforma más que una decisión tomada bajo presión.' },
  { text: 'La rutina no te limita: te libera de tener que decidir lo mismo cada mañana.' },
  { text: 'No necesitas motivación para cumplir lo que ya has decidido.' },
  { text: 'Lo que repites sin pensar es lo que al final te define.' },
  { text: 'La disciplina no aparece un lunes: se construye en las decisiones que nadie observa.' },
  { text: 'Cada día que cumples lo prometido refuerzas la confianza en ti mismo.' },
  { text: 'Las grandes transformaciones empiezan por hacer algo pequeño durante tiempo suficiente.' },
  { text: 'No es fuerza de voluntad lo que necesitas. Es un sistema que la reemplace.' },
  { text: 'Cuando el hábito forma parte de tu identidad, dejar de hacerlo te resulta extraño.' },
  { text: 'Avanzar un poco cada día parece poco hasta que miras atrás.' },
  { text: 'La clave no es la intensidad del esfuerzo. Es la ausencia de interrupciones.' },
  { text: 'Quien domina sus mañanas no necesita que el resto del día le sorprenda.' },
  { text: 'Lo difícil de mantener no es la primera vez. Es la trigésima.' },
  { text: 'La constancia no necesita entusiasmo. Necesita decisión.' },
  { text: 'Tu entorno tiene más poder sobre tus hábitos que tu fuerza de voluntad.' },
  { text: 'No cambias tu vida cambiando lo que haces una vez. La cambias cambiando lo que haces siempre.' },
  { text: 'El primer paso de un hábito nunca es perfecto. Y no necesita serlo.' },
  { text: 'La mejor rutina es aquella que no requiere que pienses en seguirla.' },
  { text: 'Cada vez que cumples una promesa pequeña, te haces más grande.' },

  // ─── MENTE (20 frases) ───
  { text: 'Lo que crees que piensas y lo que realmente piensas rara vez son lo mismo.' },
  { text: 'Observar un pensamiento sin reaccionar a él ya es libertad.' },
  { text: 'Tu mente no es tu enemiga. Simplemente no ha aprendido a estar quieta.' },
  { text: 'La calma no llega cuando se acaba el problema. Llega cuando dejas de necesitar que acabe.' },
  { text: 'Respirar no es un descanso. Es el acto más consciente del día.' },
  { text: 'No puedes controlar lo que te ocurre, pero sí lo que ocurre después dentro de ti.' },
  { text: 'La ansiedad es la mente intentando resolver un problema que aún no existe.' },
  { text: 'Sentir no es debilidad. Ignorar lo que sientes, sí.' },
  { text: 'Cuando te permites estar mal sin intentar arreglarlo, el malestar empieza a moverse.' },
  { text: 'No necesitas silenciar tus pensamientos. Necesitas dejar de creerte todos.' },
  { text: 'La meditación no es dejar la mente en blanco. Es observar sin juzgar lo que pasa.' },
  { text: 'Quien se toma cinco minutos para respirar antes de responder gana la conversación.' },
  { text: 'La serenidad no es no sentir. Es sentir sin que eso te arrastre.' },
  { text: 'Tu bienestar emocional no depende de que todo vaya bien. Depende de cómo lo atraviesas.' },
  { text: 'Hablar contigo mismo con amabilidad no es egoísmo. Es el principio de la salud mental.' },
  { text: 'Los pensamientos repetitivos pierden fuerza cuando los miras como si fueran nubes.' },
  { text: 'La claridad mental no se logra pensando más. Se logra retirando lo innecesario.' },
  { text: 'Aprender a estar incómodo emocionalmente sin huir es una de las habilidades más valiosas que existen.' },
  { text: 'No estás triste sin motivo. A veces el motivo es simplemente que necesitas pausar.' },
  { text: 'El silencio interior no se consigue luchando contra el ruido. Se consigue dejándolo pasar.' },

  // ─── ENERGÍA (20 frases) ───
  { text: 'No comes solo para alimentarte. Comes para decidir cómo te vas a sentir esta tarde.' },
  { text: 'Tu cuerpo no pide dietas extremas. Pide coherencia entre lo que le das y lo que esperas de él.' },
  { text: 'Dormir bien no es un lujo. Es la base sobre la que se construye todo lo demás.' },
  { text: 'La energía que tienes mañana depende de las decisiones que tomas después de cenar.' },
  { text: 'No hay suplemento que sustituya lo que una noche de sueño reparador hace por tu mente.' },
  { text: 'Moverse no es una obligación. Es la forma en que tu cuerpo agradece estar vivo.' },
  { text: 'Lo que bebes cada día influye más en tu estado de ánimo de lo que imaginas.' },
  { text: 'Cuidar tu energía no es egoísmo. Es la condición para poder cuidar lo demás.' },
  { text: 'Un cuerpo bien nutrido no piensa en comer constantemente. Piensa en vivir.' },
  { text: 'El descanso no se gana. Se planifica.' },
  { text: 'No necesitas entrenar como un atleta. Necesitas moverte como alguien que respeta su cuerpo.' },
  { text: 'La comida no es premio ni castigo. Es combustible para la persona que quieres ser.' },
  { text: 'Cuando duermes lo suficiente, las decisiones difíciles se vuelven más claras.' },
  { text: 'Tu cuerpo te habla todo el tiempo. El problema es que rara vez te detienes a escucharlo.' },
  { text: 'La fatiga crónica no se cura con café. Se cura con decisiones distintas.' },
  { text: 'Hidratarse es el acto más simple y más ignorado del cuidado personal.' },
  { text: 'La diferencia entre sentirse bien y sentirse extraordinario está en la consistencia de los pequeños cuidados.' },
  { text: 'No eres lo que comes. Eres lo que tu cuerpo consigue hacer con lo que comes.' },
  { text: 'El movimiento diario no necesita ser intenso. Necesita ser habitual.' },
  { text: 'Cada comida es una oportunidad para construir o destruir tu bienestar de esta semana.' },

  // ─── FINANZAS (20 frases) ───
  { text: 'Gastar menos de lo que ganas no es restricción. Es la primera forma de libertad real.' },
  { text: 'El dinero que no tienes aún no existe. No tomes decisiones actuales basándote en dinero futuro.' },
  { text: 'Ahorrar no es lo que sobra al final del mes. Es lo primero que haces con lo que entra.' },
  { text: 'No necesitas ganar más para empezar a construir algo sólido. Necesitas gastar con más consciencia.' },
  { text: 'La tranquilidad financiera no llega con una cifra en el banco. Llega cuando tus gastos están alineados con tus valores.' },
  { text: 'Cada euro que gastas sin pensar es un euro que no trabaja para tu futuro.' },
  { text: 'La mejor inversión no es la que más rentabilidad promete. Es la que puedes mantener sin sacrificar tu paz.' },
  { text: 'El verdadero patrimonio no se mide en lo que tienes. Se mide en lo que no necesitas tener.' },
  { text: 'No te endeudes por algo que pierde valor desde el momento en que lo compras.' },
  { text: 'Un presupuesto no te limita. Te muestra dónde está yendo tu libertad.' },
  { text: 'La riqueza invisible es aquella que te permite decir no cuando quieres decir no.' },
  { text: 'Construir seguridad financiera es aburrido, lento y necesario. Casi todo lo que vale la pena lo es.' },
  { text: 'No compares tu economía con la imagen que los demás proyectan. Casi siempre es una ilusión.' },
  { text: 'El primer paso hacia el control financiero es saber exactamente a dónde va tu dinero.' },
  { text: 'Separar lo que necesitas de lo que quieres te ahorra años de preocupación.' },
  { text: 'Invertir en tu formación es la única gasta que siempre paga dividendos.' },
  { text: 'El dinero es una herramienta. Cuando se convierte en el objetivo, pierde su utilidad.' },
  { text: 'No necesitas ser rico para estar tranquilo. Necesitas que tus números tengan sentido.' },
  { text: 'Una emergencia financiera no se resuelve cuando llega. Se previene mucho antes.' },
  { text: 'Lo que no sabes sobre tu propio dinero es exactamente lo que te genera inquietud.' },

  // ─── CRECIMIENTO (20 frases) ───
  { text: 'Aprender algo nuevo no solo te añade conocimiento. Te quita un miedo.' },
  { text: 'La persona que eras hace un año no reconocería lo que ahora te resulta natural.' },
  { text: 'No creces cuando todo va bien. Creces cuando lo difícil te encuentra preparado.' },
  { text: 'El crecimiento personal no necesita audiencia. Necesita honestidad.' },
  { text: 'Lo que no te desafía no te cambia.' },
  { text: 'La mejor versión de uno mismo no se alcanza. Se mantiene.' },
  { text: 'Cada vez que te equivocas y lo aceptas, ganas una libertad que no tenías antes.' },
  { text: 'Desafiarte a ti mismo no es castigo. Es el respeto más grande que puedes mostrarte.' },
  { text: 'No necesitas saber todo el camino. Necesitas la voluntad de dar el siguiente paso.' },
  { text: 'Aprender de los demás acelera el proceso. Aprender de uno mismo lo profundiza.' },
  { text: 'El conocimiento que no se aplica es solo información almacenada.' },
  { text: 'La vulnerabilidad no es debilidad. Es el espacio donde ocurre el verdadero crecimiento.' },
  { text: 'Cuando dejas de compararte, por fin puedes medir tu propio progreso.' },
  { text: 'No hay crecimiento sin la disposición a sentirse principiante otra vez.' },
  { text: 'Los obstáculos no están ahí para detenerte. Están para mostrarte qué necesitas aprender.' },
  { text: 'Lo que te resulta fácil hoy costó trabajo antes de convertirse en natural.' },
  { text: 'La resiliencia no significa no caer. Significa saber qué hacer después de caer.' },
  { text: 'Crecer es aceptar que siempre habrá algo que no sabes y decidir averiguarlo.' },
  { text: 'La experiencia no te hace mejor. Te hace más consciente de lo que te falta por mejorar.' },
  { text: 'No esperes a sentirte preparado para dar un paso. El paso es lo que te prepara.' },

  // ═══════════════════════════════════════════
  // 100 FRASES NUEVAS — FASE 8.7
  // Colección Premium VitaZen — Expansión editorial
  // Prioridad: temas infra-representados
  // Distribución por temas:
  //   Creatividad: 7
  //   Naturaleza: 6
  //   Humildad: 5
  //   Servicio: 5
  //   Coraje: 6
  //   Responsabilidad: 5
  //   Autocontrol: 5
  //   Gratitud: 5
  //   Propósito: 5
  //   Visión: 5
  //   Liderazgo: 5
  //   Sabiduría práctica: 5
  //   Nutrición: 5
  //   Aprendizaje: 5
  //   Relaciones: 5
  //   Carácter: 4
  //   Finanzas: 4
  //   Autenticidad: 4
  //   Tiempo y priorización: 3
  //   Presencia: 3
  //   Silencio y entorno: 3
  // ═══════════════════════════════════════════

  // ─── CREATIVIDAD (7) ───
  { text: 'Crear sin juzgar el resultado es el acto más libre que existe.' },
  { text: 'La creatividad exige espacio vacío antes de llenarlo.' },
  { text: 'Toda obra empieza por una mano que se atreve a mancharse.' },
  { text: 'El borrador imperfecto siempre supera a la idea perfecta que nunca existió.' },
  { text: 'Inventar es permitir que lo que no tiene sentido encuentre el suyo.' },
  { text: 'La rutina protege al cuerpo pero ahoga lo que aún no tiene forma.' },
  { text: 'Las ideas que no ejecutas se convierten en deuda creativa.' },

  // ─── NATURALEZA (6) ───
  { text: 'Un paseo sin objetivo a veces resuelve más que una hora de deliberación.' },
  { text: 'Ningún árbol crece deprisa y sin embargo llega a dar sombra.' },
  { text: 'El silencio de un bosque tiene más respuestas que una sala llena de ruido.' },
  { text: 'Moverse al aire libre cambia algo que permanece inmóvil en una oficina.' },
  { text: 'La luz natural no solo ilumina. Reordena lo que la artificial desordena.' },
  { text: 'Poner los pies descalzos sobre la tierra devuelve algo que las pantallas quitan.' },

  // ─── HUMILDAD (5) ───
  { text: 'Reconocer lo que ignoras es la puerta más estrecha y la más honesta.' },
  { text: 'Quien presume de saberlo todo ya dejó de aprender en silencio.' },
  { text: 'La grandeza más silenciosa es la que no necesita testigos.' },
  { text: 'Admitir un error delante de otros libera más que ocultarlo durante años.' },
  { text: 'Saber que queda mucho por descubrir no debilita. Ensancha.' },

  // ─── SERVICIO (5) ───
  { text: 'Dar sin esperar nada a cambio es la inversión con mayor retorno invisible.' },
  { text: 'Ayudar a otro a avanzar no te retrasa. Te muestra un atajo que ignorabas.' },
  { text: 'La marca más profunda que dejas no está en tus logros. Está en las personas.' },
  { text: 'Estar presente cuando alguien te necesita vale más que cualquier recurso que puedas ofrecer.' },
  { text: 'Tu mayor riqueza no se mide en lo que acumulas. Se mide en lo que ofreces.' },

  // ─── CORAJE (6) ───
  { text: 'Atravesar el miedo con los pies temblando es más valiente que no sentirlo.' },
  { text: 'Hablar la verdad cuando todos callan cuesta caro. Pero el silencio cuesta más.' },
  { text: 'Dar un paso hacia lo desconocido siempre se siente como un salto al vacío.' },
  { text: 'La fragilidad que mostraste ayer se convirtió en la fuerza que te define hoy.' },
  { text: 'Elegir lo difícil cuando lo fácil te tentaba forja algo que la comodidad jamás tocará.' },
  { text: 'Iniciar algo sabiendo que podrías fracasar es la forma más pura de confianza en ti.' },

  // ─── RESPONSABILIDAD (5) ───
  { text: 'Asumir la consecuencia de tus actos te libera de la carga de la excusa.' },
  { text: 'Echar la culpa al contexto te devuelve el poder de cambiarlo.' },
  { text: 'La persona que te devolvió la confianza fue aquella que asumió su error sin condiciones.' },
  { text: 'Elegir conscientemente qué sostener revela más madurez que intentar sostenerlo todo.' },
  { text: 'Cuando dejas de justificarte empiezas a solucionar.' },

  // ─── AUTOCONTROL (5) ───
  { text: 'Dominar el impulso de responder cuando estás enfadado es la victoria más silenciosa.' },
  { text: 'La diferencia entre reaccionar y responder mide la distancia entre instinto e inteligencia.' },
  { text: 'Elegir lo que comes cuando estás cansado revela más que cualquier test de personalidad.' },
  { text: 'Cerrar la boca a tiempo evita batallas que ni siquiera debieron comenzar.' },
  { text: 'Elegir tu próxima acción en lugar de reaccionar es la forma más práctica de libertad.' },

  // ─── GRATITUD (5) ───
  { text: 'Agradecer lo que tienes agranda la visión de lo que es posible.' },
  { text: 'La persona más rica es aquella que se sorprende de lo que ya posee.' },
  { text: 'Dar las gracias por lo ordinario transforma lo invisible en evidente.' },
  { text: 'Un día agradecido produce más que una semana quejándose.' },
  { text: 'Aquello que das por sentado fue alguna vez lo que pedías con desesperación.' },

  // ─── PROPÓSITO (5) ───
  { text: 'Tener un propósito no te libra de dudar. Te da un lugar al que volver después.' },
  { text: 'Construir algo que te sobreviva es la forma más humilde de inmortalidad.' },
  { text: 'Cuando lo que haces se alinea con lo que te importa, el esfuerzo deja de pesarte.' },
  { text: 'El propósito no se anuncia. Se nota en la energía con la que te levantas.' },
  { text: 'Perder la dirección no significa haberla perdido para siempre. Significa que es hora de parar.' },

  // ─── VISIÓN (5) ───
  { text: 'Ver algo que otros aún no perciben requiere una atención entrenada durante años.' },
  { text: 'La persona que imagina un futuro mejor y trabaja en el hoy construye el puente más largo.' },
  { text: 'Soñar sin actuar es entretenimiento. Actuar sin soñar es agotamiento.' },
  { text: 'Tu visión del futuro vale exactamente lo que estás dispuesto a sacrificar por ella.' },
  { text: 'Aquello que imaginas con nitidez ya empieza a tomar forma en tus decisiones.' },

  // ─── LIDERAZGO (5) ───
  { text: 'Hacer que otros confíen en sí mismos es el acto más profundo de liderazgo.' },
  { text: 'El mejor líder es aquel cuya ausencia no interrumpe el funcionamiento del equipo.' },
  { text: 'Dar ejemplo cuando nadie observa es la prueba definitiva de liderazgo.' },
  { text: 'Un equipo que piensa por sí mismo es el logro más grande de un líder.' },
  { text: 'Demostrar con coherencia inspira más que mil discursos motivacionales.' },

  // ─── SABIDURÍA PRÁCTICA (5) ───
  { text: 'La experiencia más cara es aquella que podrías haber aprendido observando.' },
  { text: 'Saber cuándo parar es tan valioso como saber cuándo insistir.' },
  { text: 'Los peores momentos enseñan lo que los mejores jamás podrían.' },
  { text: 'Un buen consejo llega tarde cuando la decisión ya se tomó por impulso.' },
  { text: 'La persona que lee dos horas al día se separa de la que no lo hace de forma invisible.' },

  // ─── NUTRICIÓN (5) ───
  { text: 'Lo que comes en secreto revela más sobre ti que lo que comes en público.' },
  { text: 'Tu plato de hoy construye o destruye tu energía de mañana.' },
  { text: 'Cocinar para ti mismo es el acto más concreto de respeto propio que existe.' },
  { text: 'La primera comida del día dicta el ritmo del resto.' },
  { text: 'Elegir agua antes que cualquier otra bebida es la decisión más pequeña con mayor impacto.' },

  // ─── APRENDIZAJE (5) ───
  { text: 'La curiosidad que no se alimenta se convierte en conformidad.' },
  { text: 'Un libro que te incomoda te enseña más que diez que te confirman.' },
  { text: 'Volver a lo básico cuando crees saberlo todo es la señal de un verdadero aprendiz.' },
  { text: 'La velocidad a la que aprendes depende de la velocidad a la que preguntas.' },
  { text: 'Aquello que no entiendes hoy puede ser la clave de lo que construyas mañana.' },

  // ─── RELACIONES (5) ───
  { text: 'Una conversación honesta vale más que cien interacciones correctas.' },
  { text: 'Elegir con quién compartes tu tiempo es elegir quién te influye.' },
  { text: 'La persona que te escucha sin interrumpirte te está dando el regalo más raro.' },
  { text: 'Elegir que el pasado no escriba tu futuro es la forma más valiente de avanzar.' },
  { text: 'Las relaciones que atraviesan el conflicto sin romperse son las más sólidas.' },

  // ─── CARÁCTER (4) ───
  { text: 'Tu carácter se revela cuando nadie te observa y tienes algo que ganar haciendo lo incorrecto.' },
  { text: 'Hacer lo correcto cuando nadie aplaude construye algo que los aplausos jamás construirían.' },
  { text: 'La coherencia entre tu palabra privada y tu acción pública es la medida más exacta de quién eres.' },
  { text: 'La integridad se nota cuando cumplir tu palabra te cuesta más que romperla.' },

  // ─── FINANZAS (4) ───
  { text: 'Tu historial de compras cuenta una historia más honesta que tus intenciones de ahorro.' },
  { text: 'La primera vez que dijiste no a una compra impulsiva nació algo dentro de ti.' },
  { text: 'Vivir por debajo de tus posibilidades protege tu futuro de forma silenciosa y constante.' },
  { text: 'Un gasto pequeño repetido cada día es la fuga más invisible de tu patrimonio.' },

  // ─── AUTENTICIDAD (4) ───
  { text: 'La primera versión de cualquier cosa siempre es torpe. La perfección es una excusa para no empezar.' },
  { text: 'Tu cuerpo guarda memoria de cada decisión que tomas. Tarde o temprano la muestra.' },
  { text: 'La persona que dice lo que piensa sin lastimar construye la confianza más sólida.' },
  { text: 'Dejar de interpretar un papel que no te corresponde es la transformación más radical que existe.' },

  // ─── TIEMPO Y PRIORIZACIÓN (3) ───
  { text: 'Elegir una sola prioridad y sostenerla durante un mes produce más que diez objetivos simultáneos.' },
  { text: 'Tu energía se agota en proporción directa a las decisiones que pospones.' },
  { text: 'La mejor versión de tu día empieza con una decisión que tomas antes de que el mundo te exija algo.' },

  // ─── PRESENCIA (3) ───
  { text: 'El aburrimiento productivo es el estado en el que las mejores ideas encuentran espacio para nacer.' },
  { text: 'Hacer una sola cosa con toda tu atención transforma lo ordinario en memorable.' },
  { text: 'Tu presencia física sin tu atención mental es una ausencia disfrazada.' },

  // ─── SILENCIO Y ENTORNO (3) ───
  { text: 'Rodearte de personas que te desafían es la estrategia de crecimiento más infrautilizada.' },
  { text: 'El silencio que creas alrededor de tus decisiones determina su calidad.' },
  { text: 'Aquello que toleras en silencio acaba convirtiéndose en tu estándar mínimo.' },

] as const;
import type { TermKey } from "./glossary";
import type { GlossaryLocale } from "./glossaryLocale";

export type TranslatedTerm = { term: string; definition: string };

/**
 * Arabic and Spanish info-icon text, one entry per glossary id (tsc fails if an id is missing).
 * Term names follow the termbase in /mnt/project-files/i18n/01-glossary.md.
 * DRAFT: written by Claude; a native speaker should review before clients rely on it.
 * Units and names (tCO₂e, SBTi, GHG Protocol, AR5/AR6) are never translated.
 */
export const GLOSSARY_TRANSLATIONS: Record<Exclude<GlossaryLocale, "en">, Record<TermKey, TranslatedTerm>> = {
  ar: {
    scope1: {
      term: "النطاق 1",
      definition: "الانبعاثات المباشرة من مصادر تملكها الشركة أو تتحكم فيها، مثل الوقود المحروق في الغلايات والمولدات ومركبات الشركة.",
    },
    scope2: {
      term: "النطاق 2",
      definition: "الانبعاثات غير المباشرة الناتجة عن الكهرباء والبخار والتدفئة والتبريد التي تشتريها الشركة وتستخدمها.",
    },
    scope3: {
      term: "النطاق 3",
      definition: "جميع الانبعاثات غير المباشرة الأخرى في سلسلة القيمة، مثل السلع المشتراة والنقل وسفر العمل والنفايات.",
    },
    tco2e: {
      term: "طن مكافئ ثاني أكسيد الكربون (tCO₂e)",
      definition: "وحدة تُحوَّل فيها جميع غازات الدفيئة إلى كمية ثاني أكسيد الكربون التي تسبب الاحترار نفسه، كي يمكن جمعها معًا.",
    },
    kgco2e: {
      term: "كغ مكافئ ثاني أكسيد الكربون لكل وحدة",
      definition: "الكيلوغرامات من مكافئ ثاني أكسيد الكربون لوحدة واحدة معلنة من المنتج. 1000 كغ = 1 طن.",
    },
    ghg: {
      term: "غازات الدفيئة (GHG)",
      definition: "ثاني أكسيد الكربون والميثان وأكسيد النيتروز وغازات أخرى تحبس الحرارة في الغلاف الجوي. تتبع التقارير بروتوكول GHG Protocol.",
    },
    emissionFactor: {
      term: "معامل الانبعاث",
      definition: "رقم يحوّل النشاط إلى انبعاثات، مثل كغ CO₂e لكل لتر ديزل أو لكل kWh. النشاط × معامل الانبعاث = الانبعاثات.",
    },
    activityData: {
      term: "بيانات النشاط",
      definition: "الكمية المقيسة للنشاط المسبب للانبعاثات، مثل لترات الوقود أو kWh من الكهرباء أو الكيلومترات المقطوعة.",
    },
    dataCoverage: {
      term: "تغطية البيانات",
      definition: "نسبة المواقع المختارة التي أبلغت عن بيانات لهذه الفترة. التغطية المنخفضة تعني أن الإجماليات قد تكون غير مكتملة.",
    },
    intensity: {
      term: "كثافة الانبعاثات",
      definition: "الانبعاثات لكل وحدة إنتاج، مثل tCO₂e لكل طن من المنتج. تتيح مقارنة الفترات حتى عند تغيّر الإنتاج. تعتمد على البيانات المعتمدة فقط.",
    },
    gross: {
      term: "إجمالي الانبعاثات",
      definition: "مجموع انبعاثات النطاقات 1 و2 و3 قبل خصم ما تم توفيره بفضل الطاقة المتجددة.",
    },
    net: {
      term: "صافي الانبعاثات",
      definition: "إجمالي الانبعاثات مطروحًا منه الانبعاثات المتجنَّبة باستخدام الطاقة المتجددة.",
    },
    saved: {
      term: "الانبعاثات المتجنَّبة",
      definition: "انبعاثات تم تجنبها لأن جزءًا من الطاقة جاء من مصادر متجددة، مثل الألواح الشمسية أو عقد طاقة خضراء.",
    },
    largestSource: {
      term: "المصدر الأكبر",
      definition: "فئة الانبعاثات صاحبة الحصة الأكبر من الإجمالي في هذه الفترة.",
    },
    fera: {
      term: "الأنشطة المتعلقة بالوقود والطاقة (FERA)",
      definition: "انبعاثات إنتاج الوقود والطاقة المستخدمة وتوصيلها. تُحتسب ضمن النطاق 3 وتُضاف تلقائيًا عند الحفظ.",
    },
    threshold: {
      term: "حد التنبيه",
      definition: "نسبة التغيّر عن الشهر الماضي التي يُنبَّه بعدها إلى الفئة (بين 2% و5%، والافتراضي 5%).",
    },
    baseYear: {
      term: "سنة الأساس",
      definition: "السنة المرجعية التي تُقاس عليها الأهداف ونسب الخفض.",
    },
    sbti: {
      term: "مبادرة الأهداف المستندة إلى العلم (SBTi)",
      definition: "مبادرة تضع قواعد لأهداف خفض الانبعاثات بما يتوافق مع علم المناخ، مثل الحد من الاحترار عند 1.5 درجة مئوية.",
    },
    pathway: {
      term: "مسار الخفض",
      definition: "الانبعاثات المسموح بها سنة بسنة وفق الهدف، من سنة الأساس حتى سنة الهدف.",
    },
    edeReport: {
      term: "تقرير EDE",
      definition: "تقرير إدخال بيانات الانبعاثات: عرض تشغيلي للبيانات المعتمدة حسب الموقع والشهر، مع الطاقة المتجددة والكثافة.",
    },
    pcf: {
      term: "البصمة الكربونية للمنتج (PCF)",
      definition: "انبعاثات وحدة واحدة من المنتج، من المواد الخام حتى خروجه من بوابة المصنع.",
    },
    cradleToGate: {
      term: "من المهد إلى البوابة",
      definition: "بصمة تشمل المواد الخام والنقل والتصنيع حتى يغادر المنتج المصنع، دون مرحلتي الاستخدام والتخلص.",
    },
    declaredUnit: {
      term: "الوحدة المعلنة",
      definition: "كمية المنتج التي تشير إليها البصمة، مثل 1 كغ أو قطعة واحدة.",
    },
    primaryData: {
      term: "بيانات أولية",
      definition: "بيانات مقيسة في مواقع الشركة أو مقدمة من الموردين، بدلًا من قيم متوسطة مأخوذة من قاعدة بيانات.",
    },
    allocation: {
      term: "التخصيص",
      definition: "طريقة توزيع الانبعاثات المشتركة، مثل طاقة المصنع، على المنتجات المصنوعة فيه، عادةً حسب الكتلة أو القيمة.",
    },
    pcr: {
      term: "قواعد فئة المنتج (PCR)",
      definition: "قواعد متفق عليها لحساب بصمة نوع معين من المنتجات، كي يمكن مقارنتها.",
    },
    gwp: {
      term: "إمكانية الاحترار العالمي (GWP)",
      definition: "مدى تسبب الغاز في الاحترار مقارنة بالكتلة نفسها من CO₂. ‏AR5 و AR6 هما إصدارا تقارير IPCC اللذان تؤخذ منهما القيم.",
    },
    overlap: {
      term: "تداخل",
      definition: "سجلان للإنتاج للمنتج والموقع نفسيهما يغطيان بعض الأيام نفسها، لذا قد يُحتسب الإنتاج مرتين.",
    },
    status: {
      term: "الحالة",
      definition: "قيد المراجعة: بانتظار المراجع. معتمد: تم التحقق منه ويُحتسب في التقارير. مرفوض: أُعيد مع سبب لتصحيحه. البيانات المعتمدة فقط تدخل في الإجماليات.",
    },
    "status.pending": {
      term: "قيد المراجعة",
      definition: "تم الإرسال وبانتظار المراجع. لا تُحتسب البيانات قيد المراجعة في التقارير بعد.",
    },
    "status.approved": {
      term: "معتمد",
      definition: "تحقق منه المراجع ويُحتسب في الإجماليات والتقارير.",
    },
    "status.rejected": {
      term: "مرفوض",
      definition: "أعاده المراجع مع ذكر السبب. يلزم التصحيح وإعادة الإرسال، ولا يُحتسب حتى يُعتمد.",
    },
    "status.missing": {
      term: "ناقص",
      definition: "لم يُدخَل أي شيء بعد لهذه الفئة وهذه الفترة.",
    },
    "status.draft": {
      term: "مسودة",
      definition: "محفوظ دون إرسال، ولا يراه أحد غير صاحبه حتى يُرسل للمراجعة.",
    },
  },
  es: {
    scope1: {
      term: "Alcance 1",
      definition: "Emisiones directas de fuentes que su empresa posee o controla, como el combustible quemado en calderas, generadores y vehículos de la empresa.",
    },
    scope2: {
      term: "Alcance 2",
      definition: "Emisiones indirectas de la electricidad, el vapor, la calefacción y la refrigeración que su empresa compra y utiliza.",
    },
    scope3: {
      term: "Alcance 3",
      definition: "Todas las demás emisiones indirectas de su cadena de valor, como bienes comprados, transporte, viajes de negocios y residuos.",
    },
    tco2e: {
      term: "Toneladas de CO₂ equivalente (tCO₂e)",
      definition: "Cada gas de efecto invernadero se convierte en la cantidad de CO₂ que calentaría el planeta lo mismo, para poder sumarlos todos.",
    },
    kgco2e: {
      term: "kg de CO₂e por unidad",
      definition: "Kilogramos de CO₂ equivalente por una unidad declarada del producto. 1.000 kg = 1 tonelada.",
    },
    ghg: {
      term: "Gases de efecto invernadero (GEI)",
      definition: "CO₂, metano, óxido nitroso y otros gases que retienen calor en la atmósfera. Los informes siguen el GHG Protocol.",
    },
    emissionFactor: {
      term: "Factor de emisión",
      definition: "Número que convierte una actividad en emisiones, por ejemplo kg CO₂e por litro de diésel o por kWh. Actividad × factor de emisión = emisiones.",
    },
    activityData: {
      term: "Datos de actividad",
      definition: "La cantidad medida de una actividad que genera emisiones, como litros de combustible, kWh de electricidad o km recorridos.",
    },
    dataCoverage: {
      term: "Cobertura de datos",
      definition: "La proporción de las sedes seleccionadas que reportaron datos en este período. Una cobertura baja indica que los totales pueden estar incompletos.",
    },
    intensity: {
      term: "Intensidad de emisiones",
      definition: "Emisiones por unidad de producción, como tCO₂e por tonelada de producto. Permite comparar períodos aunque cambie la producción. Solo usa datos aprobados.",
    },
    gross: {
      term: "Emisiones brutas",
      definition: "Total de emisiones de los alcances 1, 2 y 3 antes de restar lo ahorrado con energía renovable.",
    },
    net: {
      term: "Emisiones netas",
      definition: "Emisiones brutas menos las emisiones evitadas gracias al uso de energía renovable.",
    },
    saved: {
      term: "Emisiones evitadas",
      definition: "Emisiones evitadas porque parte de su energía provino de fuentes renovables, como paneles solares o un contrato de energía verde.",
    },
    largestSource: {
      term: "Fuente principal",
      definition: "La categoría de emisiones con la mayor parte del total en este período.",
    },
    fera: {
      term: "Actividades relacionadas con combustibles y energía (FERA)",
      definition: "Emisiones de producir y suministrar el combustible y la energía que usa. Alcance 3, se añade automáticamente al guardar.",
    },
    threshold: {
      term: "Umbral",
      definition: "El cambio porcentual respecto al mes anterior a partir del cual se señala una categoría (entre 2 % y 5 %, por defecto 5 %).",
    },
    baseYear: {
      term: "Año base",
      definition: "El año de referencia con el que se miden los objetivos y las reducciones.",
    },
    sbti: {
      term: "Iniciativa Science Based Targets (SBTi)",
      definition: "Establece reglas para objetivos de reducción de emisiones alineados con la ciencia climática, como limitar el calentamiento a 1,5 °C.",
    },
    pathway: {
      term: "Trayectoria de reducción",
      definition: "Las emisiones que permite el objetivo año a año, desde el año base hasta el año objetivo.",
    },
    edeReport: {
      term: "Informe EDE",
      definition: "Informe de registro de datos de emisiones: vista operativa de los datos aprobados por sede y mes, con renovables e intensidad.",
    },
    pcf: {
      term: "Huella de carbono del producto (PCF)",
      definition: "Las emisiones de una unidad de producto, desde las materias primas hasta la salida de la fábrica.",
    },
    cradleToGate: {
      term: "De la cuna a la puerta",
      definition: "Huella que cubre materias primas, transporte y fabricación hasta que el producto sale de su fábrica. No incluye uso ni eliminación.",
    },
    declaredUnit: {
      term: "Unidad declarada",
      definition: "La cantidad de producto a la que se refiere una huella, por ejemplo 1 kg o 1 pieza.",
    },
    primaryData: {
      term: "Datos primarios",
      definition: "Datos medidos en sus propias sedes o entregados por sus proveedores, en lugar de valores promedio tomados de una base de datos.",
    },
    allocation: {
      term: "Asignación",
      definition: "Cómo se reparten las emisiones compartidas, como la energía de una planta, entre los productos fabricados allí, normalmente por masa o por valor.",
    },
    pcr: {
      term: "Reglas de categoría de producto (RCP)",
      definition: "Reglas acordadas para calcular la huella de un tipo de producto, de modo que se puedan comparar.",
    },
    gwp: {
      term: "Potencial de calentamiento global (PCG)",
      definition: "Cuánto calienta un gas el planeta frente a la misma masa de CO₂. AR5 y AR6 son las ediciones de informes del IPCC de donde salen los valores.",
    },
    overlap: {
      term: "Solapamiento",
      definition: "Dos registros de producción del mismo producto y sede cubren algunos de los mismos días, por lo que esa producción podría contarse dos veces.",
    },
    status: {
      term: "Estado",
      definition: "Pendiente: espera revisión. Aprobado: revisado y contado en los informes. Rechazado: devuelto con un motivo. Solo los datos aprobados cuentan en los totales.",
    },
    "status.pending": {
      term: "Pendiente",
      definition: "Enviado y a la espera de un revisor. Los datos pendientes aún no cuentan en los informes.",
    },
    "status.approved": {
      term: "Aprobado",
      definition: "Revisado y contado en los totales y los informes.",
    },
    "status.rejected": {
      term: "Rechazado",
      definition: "Devuelto por un revisor con un motivo. Corríjalo y vuelva a enviarlo; no cuenta hasta que se apruebe.",
    },
    "status.missing": {
      term: "Faltante",
      definition: "Todavía no se ha registrado nada para esta categoría y período.",
    },
    "status.draft": {
      term: "Borrador",
      definition: "Guardado pero no enviado. Solo usted lo ve hasta que lo envíe a revisión.",
    },
  },
};

/** Accessible name of the info button, per language. */
export const ASK_LABEL: Record<GlossaryLocale, (term: string) => string> = {
  en: (t) => (t ? `What is ${t}?` : "What does this mean?"),
  ar: (t) => (t ? `ما معنى ${t}؟` : "ما معنى هذا؟"),
  es: (t) => (t ? `¿Qué es ${t}?` : "¿Qué significa esto?"),
};

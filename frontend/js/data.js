/* ==========================================
   راحتي — Data Constants
   ========================================== */

// Roles configuration
const ROLES = {
  admin:       { label: 'الإدارة العامة', icon: '👑' },
  supervisor:  { label: 'مشرف الفندق', icon: '🏢' },
  superfv:     { label: 'سوبر فايزر', icon: '🎯' },
  cleaner:     { label: 'عامل النظافة', icon: '🧹' },
  maintenance: { label: 'فني الصيانة', icon: '🔧' },
  reception:   { label: 'موظف الاستقبال', icon: '🛎️' },
  accountant:  { label: 'المحاسب', icon: '💼' },
  warehouse_manager: { label: 'مسؤول المستودع', icon: '🏬' },
};

// Navigation menus per role
const NAV = {
  admin: [
    { sec: 'الرئيسية', items: [
      { id: 'p-admin-dash',    ico: '📊', lbl: 'لوحة القيادة' },
      { id: 'p-admin-income',  ico: '💰', lbl: 'الدخل' },
      { id: 'p-expense-orders',ico: '🧾', lbl: 'سندات الشراء' },
      { id: 'p-warehouse-manager', ico: '🏬', lbl: 'المستودع' },
    ]},
    { sec: 'الموارد البشرية', items: [
      { id: 'p-users-mgmt',    ico: '👥', lbl: 'إدارة الموظفين' },
      { id: 'p-leaves-contracts', ico: '🏖️', lbl: 'الإجازات' },
      { id: 'p-admin-tasks',   ico: '📌', lbl: 'إدارة المهام' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
      { id: 'p-all-chats',      ico: '📁', lbl: 'كل المحادثات' },
      { id: 'p-admin-bc',      ico: '📢', lbl: 'التعاميم' },
    ]},
    { sec: 'التشغيل', items: [
      { id: 'p-admin-maint',   ico: '🔧', lbl: 'تقارير الصيانة' },
      { id: 'p-admin-reports', ico: '📈', lbl: 'التقارير والمالية' },
    ]},
    { sec: 'الإعدادات', items: [
      { id: 'p-settings',      ico: '⚙️', lbl: 'الإعدادات والقوائم' },
    ]}
  ],
  supervisor: [
    { sec: 'فندقي', items: [
      { id: 'p-sup-dash',  ico: '🏢', lbl: 'لوحة المشرف' },
      { id: 'p-expense-orders', ico: '🧾', lbl: 'سند شراء' },
      { id: 'p-supervisor-warehouse', ico: '📦', lbl: 'المستودع' },
      { id: 'p-users-mgmt',ico: '👥', lbl: 'إدارة الموظفين' },
      { id: 'p-leaves-contracts', ico: '🏖️', lbl: 'الإجازات' },
      { id: 'p-sup-tasks', ico: '📌', lbl: 'مهامي' },
      { id: 'p-settings',   ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
  superfv: [
    { sec: 'عمليات', items: [
      { id: 'p-sup-dash',  ico: '🎯', lbl: 'لوحة السوبر فايزر' },
      { id: 'p-expense-orders', ico: '🧾', lbl: 'سند شراء' },
      { id: 'p-supervisor-warehouse', ico: '📦', lbl: 'طلب مستودع' },
      { id: 'p-warehouse-manager', ico: '🏬', lbl: 'مسؤول المستودع' },
      { id: 'p-sup-tasks', ico: '📌', lbl: 'مهامي' },
      { id: 'p-settings',   ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
  cleaner: [
    { sec: 'عملي', items: [
      { id: 'p-cl-rooms',  ico: '🏠', lbl: 'الغرف' },
      { id: 'p-cl-report', ico: '📋', lbl: 'تقرير غرفة' },
      { id: 'p-settings',   ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
  maintenance: [
    { sec: 'عملي', items: [
      { id: 'p-mn-tasks', ico: '🔧', lbl: 'مهامي' },
      { id: 'p-mn-job',   ico: '✅', lbl: 'إغلاق مهمة' },
      { id: 'p-settings',  ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
  reception: [
    { sec: 'عملي', items: [
      { id: 'p-rc-report', ico: '📝', lbl: 'تقرير الاستقبال' },
      { id: 'p-rc-prices', ico: '🏷️', lbl: 'أسعار المنافسين' },
      { id: 'p-settings',  ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
  accountant: [
    { sec: 'المحاسبة', items: [
      { id: 'p-ac-dash', ico: '💼', lbl: 'لوحة المحاسب' },
      { id: 'p-expense-orders', ico: '🧾', lbl: 'مراجعة السندات' },
      { id: 'p-warehouse-manager', ico: '🏬', lbl: 'تقرير المستودع' },
      { id: 'p-settings', ico: '⚙️', lbl: 'الإعدادات' },
    ]},
    { sec: 'المحادثات', items: [
      { id: 'p-communications', ico: '💬', lbl: 'مركز التواصل' },
    ]},
  ],
};

// 42 Checklist items for room inspection
const CHECKLIST = [
  { cat: 'الأرضيات والجدران', items: [
    'الأرضية نظيفة', 'السجادة بدون بقع', 'الجدران بدون اتساخ', 'الجدران بدون كسر أو تشقق'
  ]},
  { cat: 'السرير والمفروشات', items: [
    'السرير مرتب', 'المراتب سليمة', 'الوسائد سليمة', 'الملاءات بدون تمزق', 'الغطاء بدون بقع', 'الوسائد الزائدة موجودة'
  ]},
  { cat: 'الأثاث', items: [
    'الطاولة الجانبية سليمة', 'الكرسي سليم', 'الدولاب يفتح ويغلق بشكل صحيح',
    'الأدراج سليمة', 'المكتب نظيف وسليم', 'المرآة نظيفة وبدون كسر'
  ]},
  { cat: 'التكييف والكهرباء', items: [
    'التكييف يعمل', 'جهاز التحكم بالتكييف يعمل', 'الإضاءة الرئيسية تعمل',
    'إضاءة المكتب تعمل', 'مخارج الكهرباء تعمل', 'التلفاز يعمل', 'جهاز التحكم بالتلفاز موجود'
  ]},
  { cat: 'الحمام', items: [
    'الحمام نظيف', 'المرحاض يعمل بشكل صحيح', 'الدش يعمل', 'الحوض بدون تسريب',
    'الصنبور يعمل', 'الماء الساخن متوفر', 'المرآة نظيفة', 'المناشف موجودة ونظيفة'
  ]},
  { cat: 'المستلزمات', items: [
    'الصابون موجود', 'شامبو موجود', 'أدوات الاستحمام الأخرى موجودة',
    'هاتف الغرفة يعمل', 'دليل الغرفة موجود', 'قائمة الخدمات موجودة',
    'سلة المهملات نظيفة', 'منفضة السجائر نظيفة (إن وجدت)'
  ]},
  { cat: 'الأمان', items: [
    'باب الغرفة يقفل بشكل صحيح', 'نظام الكاردكي يعمل',
    'كشف أمان الحريق يعمل', 'مخرج الطوارئ واضح'
  ]},
];

// Our base room price for comparison
const OUR_PRICE = 450;

NAV.warehouse_manager = [
  { sec: 'الرئيسية', items: [
    { id: 'p-warehouse-manager', ico: '🏬', lbl: 'المستودع' },
  ]},
  { sec: 'المحادثات', items: [
    { id: 'p-communications', ico: '💬', lbl: 'الرسائل' },
  ]},
];

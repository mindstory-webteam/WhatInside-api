import type { Translations } from './en';

/** Malayalam. Keys missing here fall back to English. */
type DeepPartial<T> = { [K in keyof T]?: T[K] extends object ? DeepPartial<T[K]> : string };

const ml: DeepPartial<Translations> = {
  app: { name: 'WhatInside', tagline: 'അകത്തെന്തുണ്ടെന്ന് അറിയൂ. ഒന്നും പാഴാക്കരുത്.' },
  common: {
    save: 'സേവ് ചെയ്യുക', cancel: 'റദ്ദാക്കുക', delete: 'ഇല്ലാതാക്കുക', edit: 'തിരുത്തുക', retry: 'വീണ്ടും ശ്രമിക്കുക',
    loading: 'ലോഡ് ചെയ്യുന്നു…', continue: 'തുടരുക', back: 'പിന്നോട്ട്', done: 'കഴിഞ്ഞു', confirm: 'സ്ഥിരീകരിക്കുക',
    close: 'അടയ്ക്കുക', search: 'തിരയുക', seeAll: 'എല്ലാം കാണുക', optional: 'ഐച്ഛികം',
    offline: 'ഓഫ്‌ലൈനാണ് — സംരക്ഷിച്ച വിവരങ്ങൾ കാണിക്കുന്നു.', pendingSync: '{{count}} മാറ്റങ്ങൾ സിങ്ക് ചെയ്യാനുണ്ട്',
    synced: 'എല്ലാം സിങ്ക് ചെയ്തു', yes: 'അതെ', no: 'ഇല്ല', somethingWrong: 'എന്തോ പിശക് സംഭവിച്ചു', notSet: 'നൽകിയിട്ടില്ല',
  },
  onboarding: {
    s1Title: 'അകത്തെന്തുണ്ടെന്ന് അറിയൂ', s1Body: 'ഫ്രിഡ്ജ്, ഫ്രീസർ, കലവറ — എല്ലാം ഒരിടത്ത്.',
    s2Title: 'ടൈപ്പ് ചെയ്യേണ്ട, സ്കാൻ ചെയ്യൂ', s2Body: 'ലേബലിൽ നിന്ന് പേരും കാലാവധിയും നേരിട്ട് വായിക്കാം.',
    s3Title: 'സമയത്ത് ഓർമ്മപ്പെടുത്തൽ', s3Body: 'കാലാവധി കഴിയും മുമ്പ് അറിയിപ്പ് — പാഴാക്കൽ കുറയ്ക്കാം.',
    s1Kicker: 'ക്രമീകരിക്കുക', s2Kicker: 'സ്കാൻ', s3Kicker: 'ഓർമ്മപ്പെടുത്തൽ', next: 'അടുത്തത്',
    getStarted: 'തുടങ്ങാം', haveAccount: 'എനിക്ക് അക്കൗണ്ട് ഉണ്ട്', skip: 'ഒഴിവാക്കുക',
  },
  auth: {
    login: 'സൈൻ ഇൻ', register: 'അക്കൗണ്ട് തുടങ്ങുക', email: 'ഇമെയിൽ', password: 'പാസ്‌വേഡ്', name: 'നിങ്ങളുടെ പേര്',
    forgot: 'പാസ്‌വേഡ് മറന്നോ?', noAccount: 'പുതിയതാണോ? അക്കൗണ്ട് തുടങ്ങുക', haveAccount: 'അക്കൗണ്ട് ഉണ്ടോ? സൈൻ ഇൻ',
    logout: 'സൈൻ ഔട്ട്', resetTitle: 'പാസ്‌വേഡ് പുനഃസജ്ജമാക്കുക', sendLink: 'ലിങ്ക് അയയ്ക്കുക',
    newPassword: 'പുതിയ പാസ്‌വേഡ്', sessionExpired: 'സെഷൻ അവസാനിച്ചു. വീണ്ടും സൈൻ ഇൻ ചെയ്യുക.',
    phone: 'മൊബൈൽ നമ്പർ', phoneHint: 'സ്ഥിരീകരിക്കാൻ 6 അക്ക കോഡ് SMS ആയി അയയ്ക്കും.',
    welcomeBack: 'വീണ്ടും സ്വാഗതം', loginSubtitle: 'മൊബൈൽ നമ്പറും പാസ്‌വേഡും ഉപയോഗിച്ച് സൈൻ ഇൻ ചെയ്യുക.',
    registerSubtitle: 'അടുക്കളയിലെ സാധനങ്ങളും കാലാവധിയും ഒരിടത്ത്.',
    sendCode: 'കോഡ് അയയ്ക്കുക', verifyTitle: 'നമ്പർ സ്ഥിരീകരിക്കുക', verifySubtitle: '{{phone}} ലേക്ക് അയച്ച 6 അക്ക കോഡ് നൽകുക.',
    verify: 'സ്ഥിരീകരിച്ച് അക്കൗണ്ട് തുടങ്ങുക', resend: 'കോഡ് വീണ്ടും അയയ്ക്കുക', resendIn: '{{time}} കഴിഞ്ഞ് വീണ്ടും അയയ്ക്കാം',
    changeNumber: 'നമ്പർ മാറ്റുക', resetHelpPhone: 'രജിസ്റ്റർ ചെയ്ത മൊബൈൽ നമ്പർ നൽകുക. പുതിയ പാസ്‌വേഡിനായി കോഡ് അയയ്ക്കും.',
    resetCodeTitle: 'പുതിയ പാസ്‌വേഡ്', confirmPassword: 'പാസ്‌വേഡ് വീണ്ടും നൽകുക', updatePassword: 'പാസ്‌വേഡ് മാറ്റുക',
    code: 'സ്ഥിരീകരണ കോഡ്', useEmail: 'ഇമെയിൽ ഉപയോഗിച്ചാണോ? ഇമെയിൽ ഉപയോഗിക്കുക', usePhone: 'മൊബൈൽ നമ്പർ ഉപയോഗിക്കുക',
    devCode: 'ടെസ്റ്റ് മോഡ് — കോഡ്', useCode: 'ഉപയോഗിക്കുക', invalidLogin: 'മൊബൈൽ നമ്പറോ പാസ്‌വേഡോ തെറ്റാണ്.',
    language: 'ഭാഷ', noAccountShort: 'പുതിയതാണോ?', createOne: 'അക്കൗണ്ട് തുടങ്ങുക', haveAccountShort: 'അക്കൗണ്ട് ഉണ്ടോ?',
    signInLink: 'സൈൻ ഇൻ', rememberedIt: 'ഓർമ്മ വന്നോ?', backToSignIn: 'സൈൻ ഇന്നിലേക്ക്', resetDoneTitle: 'പാസ്‌വേഡ് മാറ്റി',
  },
  household: {
    setupTitle: 'നിങ്ങളുടെ വീട് സജ്ജമാക്കുക', create: 'പുതിയ വീട്', join: 'ക്ഷണ കോഡ് ഉപയോഗിച്ച് ചേരുക',
    name: 'വീടിന്റെ പേര്', code: 'ക്ഷണ കോഡ്', timezone: 'സമയമേഖല', createCta: 'സൃഷ്ടിക്കുക', joinCta: 'ചേരുക',
  },
  tabs: { home: 'ഹോം', inventory: 'സാധനങ്ങൾ', add: 'ചേർക്കുക', reminders: 'ഓർമ്മകൾ', more: 'കൂടുതൽ' },
  home: {
    greeting: 'നമസ്കാരം, {{name}}', allGood: 'ഈ ആഴ്ച ഒന്നും കാലഹരണപ്പെടുന്നില്ല', viewDetails: 'വിശദാംശങ്ങൾ',
    quickAdd: 'വേഗത്തിൽ ചേർക്കുക', myInventory: 'എന്റെ സാധനങ്ങൾ', active: 'സജീവം', expiringSoon: 'ഉടൻ കാലഹരണപ്പെടും',
    expired: 'കാലഹരണപ്പെട്ടു', review: 'തീയതി പരിശോധിക്കണം', shopping: 'ഷോപ്പിംഗ് ലിസ്റ്റ്',
    next7: 'അടുത്ത 7 ദിവസത്തിൽ കാലഹരണപ്പെടുന്നവ', recent: 'സമീപകാല പ്രവർത്തനം', noActivity: 'ഇതുവരെ ഒന്നുമില്ല.',
    alerts: 'അറിയിപ്പുകൾ', thisWeek: 'ഈ ആഴ്ച', viewAlerts: 'അറിയിപ്പുകൾ കാണുക',
    needAttention_one: 'സാധനം ശ്രദ്ധിക്കണം', needAttention_other: 'സാധനങ്ങൾ ശ്രദ്ധിക്കണം',
    expiredCount: '{{count}} കാലഹരണപ്പെട്ടു', soonCount: '{{count}} ഉടൻ കാലഹരണം', scanSub: 'ഫോട്ടോയിൽ നിന്ന് പേരും തീയതിയും',
  },
  add: {
    title: 'സാധനം ചേർക്കുക', ocr: 'ലേബൽ സ്കാൻ ചെയ്യുക', recommended: 'ശുപാർശ', barcode: 'ബാർകോഡ് സ്കാൻ',
    manual: 'സ്വയം നൽകുക',
  },
  ocr: {
    title: 'ലേബൽ സ്കാൻ', capture: 'ഫോട്ടോ എടുക്കുക', gallery: 'ഫോട്ടോ അപ്‌ലോഡ്', retake: 'വീണ്ടും എടുക്കുക',
    reading: 'വിവരങ്ങൾ വായിക്കുന്നു…', manualInstead: 'സ്വയം നൽകുക', failed: 'ലേബൽ വായിക്കാനായില്ല',
  },
  review: {
    title: 'വിവരങ്ങൾ പരിശോധിക്കുക', productName: 'സാധനത്തിന്റെ പേര്', brand: 'ബ്രാൻഡ്', quantity: 'അളവ്', unit: 'യൂണിറ്റ്',
    mfgDate: 'നിർമ്മാണ തീയതി', expiryDate: 'കാലാവധി തീയതി', bestBefore: 'ബെസ്റ്റ് ബിഫോർ', batchNumber: 'ബാച്ച് നമ്പർ',
    storage: 'സൂക്ഷിക്കുന്ന സ്ഥലം', save: 'സേവ് ചെയ്യുക', scanAgain: 'വീണ്ടും സ്കാൻ', uncertain: 'ദയവായി പരിശോധിക്കുക',
    saved: 'സേവ് ചെയ്തു', endOfMonth: 'മാസാവസാനം', startOfMonth: 'മാസാരംഭം',
  },
  inventory: {
    title: 'സാധനങ്ങൾ', all: 'എല്ലാം', refrigerator: 'ഫ്രിഡ്ജ്', freezer: 'ഫ്രീസർ', pantry: 'കലവറ', other: 'മറ്റുള്ളവ',
    expiringSoon: 'ഉടൻ കാലഹരണം', expired: 'കാലഹരണപ്പെട്ടു', review: 'പരിശോധിക്കണം', searchPlaceholder: 'തിരയുക…',
    empty: 'ഇവിടെ ഒന്നുമില്ല', used_up: 'തീർന്നവ',
  },
  status: {
    fresh: 'പുതിയത്', expiring_soon: 'ഉടൻ കാലഹരണം', expired: 'കാലഹരണപ്പെട്ടു', unknown: 'തീയതി പരിശോധിക്കുക',
    expiresIn_one: '{{count}} ദിവസത്തിൽ കാലഹരണം', expiresIn_other: '{{count}} ദിവസത്തിൽ കാലഹരണം', expiresToday: 'ഇന്ന് കാലഹരണം',
    noDate: 'കാലാവധി തീയതിയില്ല', finished: 'തീർന്നു', discarded: 'കളഞ്ഞു',
  },
  detail: { title: 'വിശദാംശങ്ങൾ', consume: 'ഉപയോഗിച്ചു', finish: 'തീർന്നു', discard: 'കളഞ്ഞു', restock: 'വീണ്ടും ചേർക്കുക', savedNote: 'സാധനങ്ങളിൽ സേവ് ചെയ്തു.', addAnother: 'മറ്റൊന്ന് ചേർക്കുക', finishTitle: 'തീർന്നതായി അടയാളപ്പെടുത്തണോ?', closedNote: 'ഈ സാധനം തീർന്നു. സാധനങ്ങൾ → തീർന്നവ എന്നതിൽ കാണാം.' },
  time: {
    justNow: 'ഇപ്പോൾ', minutes_one: '{{count}} മിനിറ്റ് മുമ്പ്', minutes_other: '{{count}} മിനിറ്റ് മുമ്പ്',
    hours_one: '{{count}} മണിക്കൂർ മുമ്പ്', hours_other: '{{count}} മണിക്കൂർ മുമ്പ്', days_one: '{{count}} ദിവസം മുമ്പ്', days_other: '{{count}} ദിവസം മുമ്പ്',
  },
  events: { added: 'ചേർത്തു', consumed: 'ഉപയോഗിച്ചു', discarded: 'കളഞ്ഞു', restocked: 'വീണ്ടും ചേർത്തു', finished: 'തീർന്നു' },
  storage: { refrigerator: 'ഫ്രിഡ്ജ്', freezer: 'ഫ്രീസർ', pantry: 'കലവറ', other: 'മറ്റു സ്ഥലം' },
  shopping: { title: 'ഷോപ്പിംഗ് ലിസ്റ്റ്', add: 'ചേർക്കുക', empty: 'ലിസ്റ്റ് ശൂന്യമാണ്', purchased: 'വാങ്ങി' },
  reminders: {
    title: 'ഓർമ്മപ്പെടുത്തലുകൾ', alerts: 'അറിയിപ്പുകൾ', history: 'അയച്ചവ', upcoming: 'വരാനുള്ളവ',
    noAlerts: 'എല്ലാം ശരി!', noAlertsBody: 'ഒന്നും കാലഹരണപ്പെട്ടിട്ടില്ല.', d7: '7 ദിവസം മുമ്പ്', d3: '3 ദിവസം മുമ്പ്', d1: '1 ദിവസം മുമ്പ്', d0: 'കാലാവധി ദിവസം',
  },
  insights: { title: 'വിശകലനം' },
  settings: { title: 'ക്രമീകരണങ്ങൾ', language: 'ഭാഷ', profile: 'പ്രൊഫൈൽ', family: 'കുടുംബാംഗങ്ങൾ' },
  validation: {
    phone: 'ശരിയായ 10 അക്ക മൊബൈൽ നമ്പർ നൽകുക', phoneRequired: 'മൊബൈൽ നമ്പർ നൽകുക', otp: '6 അക്ക കോഡ് നൽകുക',
    passwordMismatch: 'പാസ്‌വേഡുകൾ ഒന്നല്ല', minPassword: 'കുറഞ്ഞത് 8 അക്ഷരങ്ങൾ', required: 'ഇത് നൽകണം',
  },
};

export default ml;

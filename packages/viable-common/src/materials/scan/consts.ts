/** The languages the research cue lexicon covers — the manager's eight. */
export const REFERENCE_CUE_LANGUAGES = Object.freeze(['be', 'de', 'en', 'es', 'fr', 'pl', 'ru', 'uk'] as const)

/** How many other words `…` lets stand between two words of a cue. */
export const REFERENCE_CUE_GAP_WORDS = 6

/**
 * The research cue lexicon, per language. A cue is words separated by spaces (a hyphen in the text
 * separates words too, so `интернет-поиск` is written `интернет поиск*`):
 *
 * - `word*` — the stem followed by any letters;
 * - `a|b*|c` — any of the alternatives in that place;
 * - `…` — up to {@link REFERENCE_CUE_GAP_WORDS} other words in between.
 *
 * Case and diacritics do not matter: the lexicon and the text are folded alike (decomposed, marks
 * dropped, lower-cased — `й` reads as `и`, `ё` as `е`, `ü` as `u`). Every language's cues are tried
 * on every text: a prompt in one language often quotes another.
 */
export const REFERENCE_RESEARCH_CUES = Object.freeze({
  be: Object.freeze([
    'знайдз*|знайсці|пошук*|шука*|вывуч*|паглядз*|прагледз*|даведа*|правер*|глян*|пачыта*|збяр* … інтэрнэ*|сеців*|анлайн|гугл*|вэб*',
    'пашука*|даслед*|ресерч*|рысерч*|загугл*|пагугл*|гуглі*|прагугл*',
    'вывуч*|аналіз*|прааналіз*|параўна*|паглядз*|прагледз*|правер*|даслед* … канкурэнт*|рынак|рынк*|аналаг*',
    'канкурэнт* … аналіз*|вывуч*|даслед*|паглядз*|правер*',
    'знайдз*|знайсці|збяр* … інфармац*|дадзен*|звестк*',
  ]),
  de: Object.freeze([
    'suche|suchen|sucht|suchet|durchsuch*|schau*|find*|informier*|recherch*|nachseh*|nachschau*|guck*|sieh* … internet*|netz|online|web|google',
    'recherch*|nachschlag*|nachschau*|googel*|ergoogel*|marktforsch*|marktanaly*|erforsch*|herausfind*|websuche|internetsuche|onlinesuche',
    'google|googel mal',
    'find* … heraus',
    'schlag* … nach',
    'prüf*|analys*|untersuch*|vergleich*|schau*|check*|sieh* … konkurren*|wettbewerb*|mitbewerb*|markt',
    'konkurren*|wettbewerb*|mitbewerb* … prüf*|analys*|untersuch*|vergleich*|anseh*|anschau*',
  ]),
  en: Object.freeze([
    'search*|look*|find*|explor*|scour*|surf*|check*|gather*|collect* … online|internet|google',
    'search*|look*|find*|explor*|scour*|surf*|check*|gather*|collect* … the web',
    'web|online|internet|google search*',
    'research*',
    'look up', 'look it|them|this|that up',
    'google it|that|this|for|around', 'googling|googled',
    'browse', 'browsing … the web', 'browsing … online|internet',
    'check*|analy*|compar*|stud*|review*|look* … competitor*|competition',
    'competitor*|competitive … analy*|research*|review*|landscape',
  ]),
  es: Object.freeze([
    'busc*|averigu*|consulta|consultar|consultalo|consulte|investig*|mira|mirar|miralo|revisa|revisar|naveg*|informate|informese|informarte|informarse|encuentr*|encontr*|indag* … internet|web|línea|online|google|red',
    'investig*|averigu*|googlea*|guglea*|búscalo|busquen|indaga*',
    'estudio|análisis de mercado',
    'estudio|análisis de la competencia',
    'analiz*|revis*|estudi*|compar*|investig*|mira|mirar|examin*|evalú*|evalu* … competencia|competidor*|mercado',
    'competencia|competidor* … analiz*|revis*|estudi*|compar*|investig*',
    'busc*|encuentr*|recopil*|reún*|reun* … información|datos',
  ]),
  fr: Object.freeze([
    'recherch*|cherch*|trouv*|consulte|consultez|consulter|fouill*|explor*|navigu*|parcour*|regarde|regardez|regarder|vérifi*|renseign*|voir … internet|web|ligne|google|net|toile',
    'recherch*|renseign*|googlis*|googler|googlez',
    'étude|analyse de marché',
    'veille concurrentielle',
    'analys*|étudi*|regarde|regardez|compar*|examin*|vérifi*|évalu* … concurren*|marché',
    'concurren* … analys*|étudi*|compar*|examin*',
    'trouv*|rassembl*|collect* … informations|données',
  ]),
  pl: Object.freeze([
    'wyszuka*|poszuka*|szukaj*|szukać|sprawdź*|znajdź*|znaleźć|przeszuka*|zbada*|poczyta*|zbierz* … internec*|internet*|sieci|online|google*|necie',
    'wyszukaj*|wyszukać|poszukaj*|poszukać|przeszukaj*|zbadaj*|zbadać|wygoogl*|wygugl*|googluj*|gugluj*|poguglaj*|przegoogl*|zgoogl*',
    'przeanaliz*|analiz*|sprawdź*|zbada*|porówn*|przejrz* … konkurenc*|rynek|rynk*|odpowiednik*',
    'konkurenc* … analiz*|sprawdź*|zbada*|przejrz*',
    'badani*|badań … rynk*|rynek|konkurenc*',
    'znajdź*|zbierz* … informacj*|dane',
  ]),
  ru: Object.freeze([
    'найд*|найт*|поиск*|поищ*|ищ*|искат*|изуч*|посмотр*|просмотр*|смотр*|узна*|провер*|глян*|почита*|собер*|прочита* … интернет*|сети|сеть|онлайн|гугл*|вебе|веб',
    'поищ*|поискат*|исследу*|исследоват*|исследовани*|ресерч*|рисерч*|загугл*|погугл*|гуглит*|гугли|прогугл*',
    'интернет|веб поиск*',
    'изуч*|анализ*|проанализ*|сравн*|посмотр*|просмотр*|провер*|исслед*|разбер* … конкурент*|рынок|рынк*|аналог*',
    'конкурент* … анализ*|изуч*|исслед*|посмотр*|провер*',
    'найд*|найт*|собер* … информаци*|данны*|сведени*',
  ]),
  uk: Object.freeze([
    'знайд*|знайт*|пошук*|шука*|вивч*|подив*|перегля*|дізна*|перевір*|глян*|почита*|збер* … інтернет*|мереж*|онлайн|гугл*|вебі|веб',
    'пошука*|дослід*|ресерч*|рісерч*|загугл*|погугл*|гугли*|прогугл*',
    'інтернет|веб пошук*',
    'вивч*|аналіз*|проаналіз*|порівня*|подив*|перегля*|перевір*|дослід* … конкурент*|ринок|ринк*|аналог*',
    'конкурент* … аналіз*|вивч*|дослід*|подив*|перевір*',
    'знайд*|знайт*|збер* … інформаці*|дані|відомост*',
  ]),
})

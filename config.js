// Podešavanja koja dele sajt (main.js) i admin stranica (admin.js).

// Paste the Apps Script URL here after running Skill 03
// (adresa koja se završava na /exec, vidi apps-script/README.md)
const ENDPOINT = 'https://script.google.com/macros/s/AKfycbzrerFNKefudKXkRAnVGEGhehVZvashWplLXnUgQsSw7lM8rCXuFy6J4gAhu-tEJlXc/exec';

// Dok je ENDPOINT prazan, forma otvara email program sa popunjenom porukom.
const FALLBACK_EMAIL = 'seventytwoweb@gmail.com';

// Termini koji se nude za poziv. Promeni ovde kad se promeni raspored.
// weekdays: 1 = ponedeljak ... 6 = subota, 0 = nedelja
const BOOKING = { daysAhead: 14, weekdays: [1, 2, 3, 4, 5], from: '10:00', to: '18:00', stepMin: 30 };

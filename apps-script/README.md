# SeventyTwo backend (Google Apps Script)

`Code.gs` prima zakazane pozive i pisane upite sa sajta, upisuje ih u Google tabelu, šalje email obaveštenje i služi admin stranicu (`admin.html`).

## Postavljanje (jednom)

1. Napravi novu Google tabelu (npr. "SeventyTwo zahtevi"). Listove Pozivi, Upiti i Blokirano skripta pravi sama.
2. U tabeli: Extensions > Apps Script.
3. Obriši sve iz `Code.gs` u editoru i nalepi ceo sadržaj fajla `apps-script/Code.gs`.
4. Na vrhu skripte po potrebi promeni:
   - `NOTIFY_TO`: adresa na koju stižu obaveštenja (sada seventytwoweb@gmail.com).
   - `ADMIN_URL`: adresa admin stranice, npr. `https://TVOJ-SAJT.vercel.app/admin.html`.
   - `SHEET_URL`: adresa tabele (nije obavezno).
5. Lozinka za admin se ne piše u kod: postavljaš je pri prvom otvaranju admin stranice (zaboravljena lozinka: Project Settings > Script Properties > obriši `ADMIN_HASH`).
6. Deploy > New deployment > Web app. Execute as: **Me**. Who has access: **Anyone**. Odobri dozvole kada Google pita.
7. Kopiraj adresu koja se završava na `/exec` i upiši je u `config.js` kao `ENDPOINT`, pa objavi sajt ponovo.

## Kasnije izmene skripte

Deploy > Manage deployments > olovka na postojećoj objavi > Version: **New version** > Deploy.
Sama izmena koda ne menja živu adresu. Ovo je korak koji se najčešće zaboravi.

## Šta skripta radi

| Poziv | Ko sme | Šta radi |
|---|---|---|
| forma sa sajta (bez `action`) | svi | upis u tabelu + email. Poziv na već zauzet termin se odbija (`error: taken`) |
| `?action=slots` | svi | vraća samo zauzete i blokirane datume i vremena, bez ličnih podataka |
| `?action=admin.list` | lozinka | svi pozivi, upiti i blokade |
| `?action=admin.update` | lozinka | status i beleška |
| `?action=admin.block` / `admin.unblock` | lozinka | blokiranje vremena ili celog dana |

## Poznata ograničenja

- Osam pogrešnih lozinki zaključava admin na 10 minuta, i za tebe.
- Ako sajt ne može da pročita odgovor skripte, posetilac ipak vidi poruku da je zahtev poslat.
- Besplatan Gmail nalog šalje do 100 emailova dnevno.
- Radno vreme za pozive (dani, sati, korak) menja se u `config.js`, ne ovde.

Slike emaila su u `apps-script/preview/`.

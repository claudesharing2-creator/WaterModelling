# WaterModelling

Web app screening dispersi perairan, Bahasa Indonesia, desktop dan mobile. Dibangun untuk deploy dari repository ini melalui GitHub Pages.

**Status: v0.1 screening, belum model hidrodinamika terkalibrasi.** Baca [metode dan cakupan](docs/METHODS.md).

## Yang sudah diimplementasikan
- Peta OpenStreetMap + overlay hasil georeferensi, pilihan sumber dan titik evaluasi.
- Tracer konservatif, peluruhan orde satu, TSS settling, transport awal minyak permukaan.
- Skenario sesaat/kontinu, 0.25–168 jam, time slider dan animasi.
- Pengambilan arus laut/angin Open-Meteo; SST/gelombang/muka laut sebagai konteks.
- Arus manual atau CSV lokal dengan validasi satuan dan waktu.
- Poligon air dari Overpass/OSM, GeoJSON, atau gambar manual; pulau dari holes.
- Sel darat NoData dan tidak menerima massa; neraca massa masuk/aktif/keluar/terurai/mengendap.
- GeoJSON, GeoTIFF + metadata, KMZ, CSV titik, JSON reproducible scenario, laporan HTML cetak/PDF.
- Web Worker; simulasi dapat dihentikan tanpa memblokir UI.

## Deploy GitHub Pages
1. Repository **Settings → Pages → Build and deployment → Source: GitHub Actions**.
2. Buka **Actions → Verify and deploy WaterModelling → Run workflow** bila belum berjalan.
3. Workflow menginstall dependencies, menjalankan pengujian model/GIS/browser, membangun dist/, lalu deploy.
4. URL yang diharapkan: https://claudesharing2-creator.github.io/WaterModelling/

Workflow membutuhkan izin contents:read, pages:write, id-token:write; tidak memerlukan token pribadi.
Jika halaman Pages belum diaktifkan, langkah 1 perlu dilakukan oleh admin.
Semua asset memakai path relatif sehingga cocok untuk project Pages (/WaterModelling/).
Paket build dist/ juga dapat dipasang pada hosting statis lain. Tidak perlu backend untuk v0.1.

## Jalankan lokal
Node.js 22 atau lebih baru:
```sh
npm install
npm test
npm run build
npm run serve
```
Buka http://localhost:4173/WaterModelling/ .
Uji browser:
```sh
npx playwright install chromium
npm run test:e2e
```
Dependencies langsung dan transitif dikunci dalam package-lock.json. CI menggunakan npm ci agar versi instalasi konsisten.

## Alur penggunaan
1. Isi koordinat WGS84, waktu UTC, jenis perairan, domain dan parameter.
2. Masukkan massa atau debit/konsentrasi sumber, kedalaman campur, K dan koefisien proses.
3. Ambil data global, atau masukkan arus manual/CSV.
4. Cari/upload/gambar poligon air; periksa pulau/tanggul dan centang konfirmasi.
5. Jalankan; klik peta untuk query rerata sel; pilih waktu dan ekspor.
Tombol **Coba demo sintetis** menyiapkan geometri/arus buatan. Demo bukan kondisi aktual.

## Batasan utama
Arus satu titik seragam spasial; bukan solver hidrodinamika. Arus global tidak valid universal untuk kanal, sungai/danau.
Poligon air OSM tidak selalu tersedia, terutama laut terbuka. Tidak ada fallback otomatis menganggap darat sebagai air.
Sel tepi dikeluarkan sehingga kanal sempit dapat hilang pada grid kasar.
Minyak bukan OpenOil penuh: tanpa weathering, beaching, entrainment atau recovery.
BOD–DO, nutrien, pH, logam, patogen, salinitas dinamis, GEBCO/Copernicus, kalibrasi, ensemble, NetCDF dan GeoPackage belum tersedia.
Input latar merupakan referensi konstan, tidak disimulasikan sebagai field ambient reaktif.
Laporan cetak berisi peta grid, belum snapshot basemap.

## Privasi dan layanan
Tidak ada token, data operasi perusahaan, atau kontak di source code. Semua skenario berada di memori browser sampai diekspor.
Koordinat dikirim ke penyedia ketika mengambil data; viewport dikirim ke tile OSM. Jangan gunakan koordinat sensitif tanpa izin yang sesuai.
Open-Meteo free endpoint untuk non-commercial sesuai ketentuan penyedia; penggunaan komersial memerlukan layanan yang sesuai.
OSM membutuhkan atribusi dan kepatuhan tile policy. Jangan bulk-download tile.

## Arsitektur
- src/engine.js: solver murni, units, validation, budgets.
- src/geo.js: validasi poligon dan grid air.
- src/data.js: konektor API/CSV/manual, time coverage, provenance.
- src/export.js: serializers GIS dan CSV.
- src/worker.js: background simulation.
- src/app.js + style.css: UI, peta dan report.
- tests/: model, geometri, GIS round-trip, browser.

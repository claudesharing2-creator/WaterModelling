# WaterModelling v0.1 — metode dan batas penggunaan

## Status implementasi
Aplikasi statis untuk GitHub Pages. Mesin screening tersendiri, bukan port MoTuM, QUAL2Kw, WASP, atau OpenOil.
Level 1 adalah global/manual screening. Upload CSV adalah peningkatan masukan lokal, tetap screening dan **tidak otomatis terkalibrasi**.
Level 3 belum diimplementasikan. Tidak ada login, telemetri, penyimpanan server, token, atau contoh data operasional pengguna.
Data contoh adalah sintetis dan tidak mendeskripsikan koordinat tempat contoh ditempatkan.

## Mesin transport
Finite-volume pada grid Cartesian lokal, adveksi upwind orde satu, difusi pusat:
dm_i/dt = sum(face inflow-outflow) + source - (k + ws/h)m_i.
Massa setiap sel dalam kg; luas sel dx²; volume dx²*h. Koordinat keluaran WGS84 menggunakan pendekatan equirectangular lokal.
Batas domain: radius 0.25–20 km; lintang ±80 derajat; antimeridian tidak didukung.
Arus u timur, v utara, m/s. Arus berubah terhadap waktu dengan interpolasi linier komponen, tetapi seragam spasial di seluruh domain.
Tidak memecahkan kontinuitas/momentum hidrodinamika; aliran yang dibatasi dinding bukan solusi hidrodinamika terkalibrasi. Akumulasi dekat batas dapat merupakan artefak forcing seragam.
Numerical diffusion upwind dapat melebar plume, terutama grid kasar. Lakukan sensitivitas grid dan K sebelum menafsirkan puncak.
Time step <=60 s dan <=0.45/[ (|u|+|v|)/dx + 4K/dx² ]. Reaksi orde satu dihitung eksponensial. Sumber kontinu dipotong tepat pada akhir pelepasan.
49 frame disimpan termasuk t=0. Hentikan jika >150000 langkah. Simulasi berjalan dalam Web Worker dan dapat dibatalkan.

## Parameter yang benar-benar tersedia
- Tracer: R=0; konservatif.
- Zat terlarut orde satu: R=-kC, k/hari input pengguna. Tidak otomatis mewakili COD/BOD/logam/nutrien.
- TSS: R=-(ws/h)C; ws m/hari. Massa mengendap dicatat, tidak hilang dari neraca. Tanpa resuspensi, flokulasi, distribusi ukuran, atau perubahan dasar.
- Minyak permukaan: transport massa permukaan, u_eff = u + alpha*wind_u dan v_eff analog. Output g/m². Pelepasan sesaat kg saja.
  Tanpa evaporasi, emulsifikasi, droplet, degradasi, beaching, respons boom/recovery atau ADIOS. Pantai impermeabel. Jangan menafsirkan akumulasi tepi sebagai massa terdampar.
  Arus Open-Meteo Marine mencakup pengaruh gelombang/pasang; Stokes/tidal drift tidak ditambahkan dua kali.
- BOD–DO, NH3/NH4, nitrat, fosfat, pH, patogen, spesiasi logam, dan organik multiproses belum tersedia.
BOD5 dan COD adalah pengukuran agregat dan memerlukan pemetaan fraksi reaktif. Kekeruhan bukan TSS. Oil & Grease, TPH, PAH dan oil film bukan parameter yang saling menggantikan.

## Beban, konsentrasi dan latar
Sumber kontinu kg/s = Q[m³/s]*Cs[mg/L]/1000.
Massa sesaat diberikan langsung dalam kg.
Konsentrasi tambahan mg/L = massa kg / volume m³ * 1000.
Minyak g/m² = massa kg / luas m² * 1000.
Field yang disimulasikan adalah massa sumber tambahan terhadap kondisi awal nol. Tidak memodelkan penambahan volume/jet outlet atau perpindahan latar akibat debit limbah.
Latar opsional adalah referensi konstan: C_total_reference=C_increment+C_background. Latar tidak diadvect atau direaksikan terpisah; hasil ini bukan solusi background dinamis.
Kedalaman campur tetap, tanpa profil vertikal. Nilai titik adalah rerata sel; tidak ada ketelitian subgrid.
Durasi di atas ambang diestimasi dengan interpolasi linier antara frame; bukan resolusi internal solver.

## Data
Open-Meteo Marine: currents/hour, SST, wave height, mean-sea-level including tides. Wind 10m dari Weather API.
SST/wave/sea level hanya konteks; **tidak** mengubah kedalaman, K, atau reaction constants dalam v0.1.
Satu titik grid laut dipakai di domain. Koordinat grid, jarak ke sumber, waktu unduh, URL permintaan dan resolusi disimpan.
API harus mencakup seluruh periode; null, NaN, unit tak dikenal, waktu duplikat, urutan salah, dan gap >3 jam ditolak.
Tanggal API dapat ditolak penyedia di luar cakupan arsip/prakiraan. Tidak ada silent fallback ke data dummy atau klimatologi.
Arus global laut tidak dipakai untuk sungai/danau. Gunakan CSV atau asumsi manual. CSV memerlukan time,u,v; wind_u,wind_v untuk minyak dengan windage. Waktu ISO dengan Z/offset. Semua kecepatan m/s.
Mode manual adalah asumsi eksplisit, bukan observasi lokal. Koefisien default (K, k, ws, depth, alpha) adalah contoh pengguna dan bukan kalibrasi.
Konektor Copernicus/HYCOM/GEBCO, kualitas latar otomatis, hidrodinamika sungai, dan multi-titik forcing belum tersedia.
Open-Meteo free API non-commercial; deployment operasional/komersial perlu layanan sesuai ketentuan dan backend jika menggunakan kredensial.
Overpass menerima koordinat bbox; Open-Meteo menerima koordinat sumber. OSM tiles menerima area viewport. Skenario lengkap tidak dikirim ke server aplikasi.

## Batas air
- Poligon OSM natural=water / waterway=riverbank via Overpass, atau upload GeoJSON air.
- Polygon/MultiPolygon WGS84; lubang untuk daratan/pulau. LineString bukan domain air.
- Poligon digambar pengguna harus disetujui pengguna. Drawing bukan coastline detection dan tidak otomatis tahu pulau.
- Laut terbuka biasanya tidak direpresentasikan poligon water di Overpass. Tidak ada fallback menganggap seluruh bbox sebagai air.
- Topologi self-intersection ditolak. Domain dibentuk hanya dari sel yang >99.999999% luasnya berada dalam poligon air.
- Sel yang memotong pantai dibuang (NoData); tepi grid berbentuk tangga. Kanal yang lebih sempit dari grid dapat tertutup.
- Antar sel air–darat tidak ada pertukaran massa. Hanya tepi kotak domain yang terbuka terhadap adveksi keluar; incremental inflow nol, gradien difusi normal nol.
- Langkah FV hanya antartetangga, sehingga tidak ada teleport melintasi sel darat.
- Pulau dan tanggul yang tidak ada di poligon input tetap tidak diketahui model. Basemap bukan data hidrodinamika dan tidak boleh dipakai menggeser hasil secara kosmetik.

## Peta dan ekspor
Peta Leaflet OSM (atribusi tetap terlihat). Overlay adalah raster georeferensi WGS84 dari sel yang sama dengan query titik.
Skala warna tetap untuk seluruh waktu skenario; opacity bisa diubah; tidak smoothing melewati pantai.
GeoJSON: semua sel air dengan nilai, unit, waktu, kedalaman, metadata.
GeoTIFF Float32 north-up WGS84, NoData=-9999; ZIP berisi sidecar metadata.
KMZ: sel poligon WGS84 dengan TimeStamp, nilai dan unit; bukan animasi lengkap.
CSV titik: time series nilai tambahan dan referensi total, koordinat pusat sel, kedalaman dan unit.
JSON: input, domain, provenance dan semua frame; import menjalankan ulang, tidak mempercayai hasil lama.
Laporan HTML cetak/PDF: peta grid georeferensi **tanpa basemap**, neraca massa, input, provenance, batasan. Basemap tidak diekspor sebagai citra agar tidak menyalin tile secara massal.
NetCDF, GeoPackage, contour export, perbandingan skenario, ensemble, profil kedalaman dan paket animasi KMZ belum tersedia.

## Verifikasi
Node test: konservasi/positivity, exact decay, settling budget, release stop, penghalang darat, open-boundary budget, units minyak, lookup titik, data invalid.
GIS tests: full wet cells tidak memotong lubang pulau, invalid polygon, GeoTIFF write/read numeric and georeferencing round-trip, NoData, escaped XML, CSV timezones.
Playwright: browser Worker, peta/frame/query, NoData pulau, ekspor, impor, mobile overflow, API null handling.
Ini verifikasi implementasi. Bukan validasi lapangan dan tidak menghasilkan label Level 3.
Uji tambahan fase berikutnya: benchmark analitik plume Gaussian untuk mengukur numerical diffusion, konvergensi grid, arus spasial divergen dan tide reversal, sensitivitas/ensemble, validasi independen drifter dan sampling.

## Referensi
- MoTuM: https://www.muteknologi.musmuin.com/motum.html — arsitektur hidrodinamika/GIS; algoritme lengkap belum diaudit.
- QUAL2Kw: https://ecology.wa.gov/research-data/data-resources/models-spreadsheets/modeling-the-environment/models-tools-for-tmdls
- WASP transport theory: https://nepis.epa.gov/Exe/ZyPURL.cgi?Dockey=P1005O7C.TXT
- D-Water Quality: https://www.deltares.nl/en/software-and-data/products/delft3d-fm-suite/modules/d-water-quality
- OpenOil: https://opendrift.github.io/autoapi/opendrift/models/openoil/index.html
- PLUMES2.0: https://www.epa.gov/hydrowq/PLUMES2
- Open-Meteo Marine: https://open-meteo.com/en/docs/marine-weather-api
- Open-Meteo Weather: https://open-meteo.com/en/docs
- OSM tile policy: https://operations.osmfoundation.org/policies/tiles/

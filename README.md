# React + Vite

This template provides a minimal setup to get React working in Vite with HMR and some ESLint rules.

## Timeline çalışma akışı

`/admin/timeline` arayüzünde yaptığınız cast düzenlemelerinin kalıcı olabilmesi için basit bir Node sunucusu ekledik. Sunucu, verileri `server/timelineStore.json` dosyasında saklar ve ileride MongoDB ya da başka bir veri kaynağına taşınabilecek şekilde JSON üretir.

### Sunucuyu başlatmak

```bash
npm run timeline:server
```

Sunucu varsayılan olarak `http://localhost:4173/api/timelines` adresinde çalışır. Arayüz bu uç noktaya otomatik olarak istekte bulunur; uzak kayıt başarısız olursa tarayıcıya JSON çıktısını indiren bir yedekleme mekanizması devreye girer.

Uzak sunucu adresini değiştirmek isterseniz `.env` dosyasında `VITE_TIMELINE_API_BASE` değişkenini tanımlayabilirsiniz.


Currently, two official plugins are available:

- [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react) uses [Babel](https://babeljs.io/) for Fast Refresh
- [@vitejs/plugin-react-swc](https://github.com/vitejs/vite-plugin-react/blob/main/packages/plugin-react-swc) uses [SWC](https://swc.rs/) for Fast Refresh

## Bunny Storage entegrasyonu

Timeline sunucusu artık Bunny Storage üzerinden görsel ve medya dosyası yüklemeyi destekler. Sunucuyu başlatmadan önce aşağıdaki ortam değişkenlerini ayarlayın:

- `BUNNY_STORAGE_ZONE`: Bunny kontrol panelindeki storage zone adı.
- `BUNNY_STORAGE_KEY`: Storage zone için oluşturulan erişim anahtarı ("Password").
- `BUNNY_STORAGE_HOST` (isteğe bağlı): Varsayılan `storage.bunnycdn.com` yerine kullanılacak özel uç nokta.
- `BUNNY_STORAGE_CDN_HOST` veya `BUNNY_CDN_HOST` (isteğe bağlı): CDN için kullanmak istediğiniz domain (ör. `assets.lyrarecords.com`).

Değişkenleri `.env` dosyasında tanımlayın ve bu dosyanın `.gitignore` içinde olduğundan emin olun. Sunucu çalıştıktan sonra:

- `POST /api/uploads`: İstemciden gelen base64 kodlu dosyayı Bunny Storage'a yükler ve CDN URL'sini döndürür.
- `DELETE /api/uploads?path=...`: Belirtilen yolu storage'tan siler.
- `GET /api/uploads/status`: Storage yapılandırmasının durumunu kontrol eder.

Yönetim arayüzünde (Admin → Gruplar & Videolar) "Bunny'e yükle" butonları ile doğrudan PNG/JPG/WebP dosyalarını Bunny Storage'a gönderebilirsiniz. Yükleme tamamlandığında ilgili alan otomatik olarak CDN adresi ile güncellenir.

## Bunny Stream notları

Video kütüphanesindeki HLS adresleri Bunny Stream üzerinden sağlanacaksa şu adımları takip edin:

1. Bunny Stream panelinde bir kitaplık (library) oluşturun ve "Pull Zone" yerine Stream kitaplığına ait API anahtarını not edin.
2. İçerikleri yükledikten sonra Bunny Stream kitaplığı her video için `.m3u8` oynatma adresi üretir. Bu adresi Admin → Video Kütüphanesi formunda "HLS Akış Bağlantısı" alanına girin.
3. İsteğe bağlı olarak "Bunny'e yükle" butonu ile poster görselini aynı storage zone'a yükleyip CDN üzerinden servis edebilirsiniz.
4. Canlıya almadan önce Bunny Stream'de TLS sertifikası eklediğiniz bir özel domain kullanacaksanız ilgili CNAME kaydını DNS tarafında oluşturmayı unutmayın.

Bu adımlar tamamlandığında JSON dosyalarında base64 veri saklamak yerine yalnızca CDN adresleri tutulur; böylece istemci tarafındaki veri boyutu ve yükleme süreleri ciddi şekilde azalır.

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

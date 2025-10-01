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

## Expanding the ESLint configuration

If you are developing a production application, we recommend using TypeScript with type-aware lint rules enabled. Check out the [TS template](https://github.com/vitejs/vite/tree/main/packages/create-vite/template-react-ts) for information on how to integrate TypeScript and [`typescript-eslint`](https://typescript-eslint.io) in your project.

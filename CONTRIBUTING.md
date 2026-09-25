# Katkıda Bulunma Rehberi

Topluyo projesine katkıda bulunmak istediğiniz için teşekkür ederiz! Lütfen katkıda bulunmadan önce aşağıdaki adımları ve kuralları inceleyin.

## Nasıl Katkıda Bulunabilirsiniz?

### 1. Hata Bildirimi (Bug Reports)
Eğer bir hata bulduysanız, sorunu çözmemize yardımcı olmak için [Hata Bildirimi şablonunu](.github/ISSUE_TEMPLATE/bug_report.md) kullanarak bir issue oluşturabilirsiniz. Lütfen hatayı yeniden üretmemizi sağlayacak tüm adımları ekleyin.

### 2. Özellik İsteği (Feature Requests)
Yeni bir özellik öneriniz varsa, [Özellik İsteği şablonunu](.github/ISSUE_TEMPLATE/feature_request.md) kullanarak bizimle paylaşabilirsiniz. Bu özelliğin ne işe yarayacağını ve neden gerekli olduğunu açıklayın.

### 3. Kod Katkısı (Pull Requests)
1. Bu depoyu kendi GitHub hesabınıza forklayın (Fork).
2. Yeni bir dal (branch) oluşturun: `git checkout -b ozellik/yeni-ozellik-adi` veya `git checkout -b hata/hata-adi`.
3. Gerekli değişiklikleri yapın ve test edin. (Proje Electron üzerinde çalışır, `npm run dev` veya Windows'ta `npm run dev:win` ile test edebilirsiniz).
4. Değişikliklerinizi commit edin: `git commit -m 'Yeni özellik: Açıklama'`.
5. Dalınızı GitHub'a gönderin: `git push origin ozellik/yeni-ozellik-adi`.
6. Bu depoya bir **Pull Request (PR)** açın. PR açarken `PULL_REQUEST_TEMPLATE.md` içerisindeki adımları doldurduğunuzdan emin olun.

## Geliştirme Ortamı Kurulumu
1. Node.js'i bilgisayarınıza kurun.
2. Bağımlılıkları yükleyin: `npm install`.
3. Uygulamayı geliştirme modunda başlatın: `npm run dev` (Windows için `npm run dev:win`).

## Kod Standartları
* Yazdığınız kodun temiz, okunabilir ve mevcut projenin yapısına uygun olmasına dikkat edin.
* PR göndermeden önce kodunuzda bir hata olmadığından emin olun.

Projemize katkı sağladığınız için teşekkürler!

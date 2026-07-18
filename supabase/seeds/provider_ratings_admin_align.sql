-- FAZ 3.5: Demo kaleci/hakem reytinglerini ADMIN PANELİ + Marketplace sözleşmesine hizala.
-- Admin paneli (DeepEditModals) kaleci istatistiklerini stats+skills'e şu anahtarlarla
-- yazar: reflexes, diving, positioning, distribution, oneOnOne, aerialReach (10-99) +
-- savePercentage, penaltySaveRate (Marketplace "Performans" karoları).
-- Hakem istatistikleri stats'a: authority, fitness, communication + avgCards, avgDistance,
-- varCallAccuracy. Oyuncu-görünürlü kartlar admin panelinden ayarlanabilen TÜM reytingleri
-- gösterebilsin diye hizalanır.
-- NOT: 'cleanSheets' (gol yemeden tamamlanan maç) istatistiği kaldırıldı — artık hiçbir
-- ekranda gösterilmiyor ve seed'e yazılmıyor.
-- NOT: Bu bir SEED'dir (migration değil) — canlıya elle uygulanır.

UPDATE public.goalkeepers SET
  stats = jsonb_build_object('reflexes',92,'diving',89,'positioning',91,'distribution',84,'oneOnOne',90,'aerialReach',88,'savePercentage','86','penaltySaveRate','34'),
  skills = jsonb_build_object('reflexes',92,'diving',89,'positioning',91,'distribution',84,'oneOnOne',90,'aerialReach',88)
WHERE id='d0e51c00-0000-4000-8000-000000000001';

UPDATE public.goalkeepers SET
  stats = jsonb_build_object('reflexes',86,'diving',85,'positioning',83,'distribution',79,'oneOnOne',84,'aerialReach',81,'savePercentage','80','penaltySaveRate','28'),
  skills = jsonb_build_object('reflexes',86,'diving',85,'positioning',83,'distribution',79,'oneOnOne',84,'aerialReach',81)
WHERE id='d0e51c00-0000-4000-8000-000000000003';

UPDATE public.goalkeepers SET
  stats = jsonb_build_object('reflexes',79,'diving',77,'positioning',78,'distribution',74,'oneOnOne',80,'aerialReach',76,'savePercentage','74','penaltySaveRate','24'),
  skills = jsonb_build_object('reflexes',79,'diving',77,'positioning',78,'distribution',74,'oneOnOne',80,'aerialReach',76)
WHERE id='d0e51c00-0000-4000-8000-000000000002';

UPDATE public.referees SET
  stats = jsonb_build_object('authority',93,'fitness',89,'communication',91,'avgCards',3.1,'avgDistance','11km','varCallAccuracy','96')
WHERE id='d0e51d00-0000-4000-8000-000000000001';

UPDATE public.referees SET
  stats = jsonb_build_object('authority',71,'fitness',69,'communication',73,'avgCards',4.4,'avgDistance','9km','varCallAccuracy','86')
WHERE id='d0e51d00-0000-4000-8000-000000000002';

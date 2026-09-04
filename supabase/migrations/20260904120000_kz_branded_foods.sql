-- Настоящие продукты казахстанского рынка: 32 позиций с указанием источника.
--
-- Зачем это понадобилось. Стартовый сид (20260903100400) - справочные значения
-- для сырых продуктов, написанные по памяти: ни ссылки, ни базы, ни скрипта
-- импорта. Проверить их было нечем. Здесь у каждой строки есть source_url,
-- и любое число можно открыть и сверить.
--
-- Источники: сайты производителей FoodMaster и ЛОТТЕ Рахат (карточки товаров
-- с блоком пищевой ценности) и Open Food Facts - открытая база под ODbL.
-- Данные собраны 2026-09-04.
--
-- Каждое число проверено на согласованность: калорийность обязана сходиться
-- с 4*белки + 9*жиры + 4*углеводы. Тридцать одна позиция сошлась в пределах
-- 4%. Одна не сошлась - сметана President: страница печатает 254 ккал при
-- 20 г жира, 2.4 белка и 3.8 углеводов, что даёт 205. Это опечатка сайта
-- (254 соответствует примерно 25% жирности), и хранить её нельзя: кольцо
-- нормы и бары Б/Ж/У считали бы разное. Взято 205 - значение, согласованное
-- с собственными БЖУ той же страницы.
--
-- Общие продукты (фрукты, овощи, яйца) сюда не входят: у них нет бренда,
-- и они уже есть в стартовом сиде.

alter table public.foods add column source_url text;

comment on column public.foods.source_url is
  'Откуда взяты КБЖУ. Пусто у продуктов, заведённых руками, и у стартового сида, '
  'который писался по памяти. Для всего нового заполнять обязательно: число '
  'без источника проверить нечем.';

insert into public.foods
  (kind, name, brand, kcal_100, protein_100, fat_100, carbs_100, source_url)
values
  ('product', 'Кефир 2,5%', 'FoodMaster', 52, 2.8, 2.5, 4.6, 'https://foodmaster.kz/ru/catalog/foodmaster-kefir-25-1'),
  ('product', 'Ряженка 2,5%', 'FoodMaster', 52, 2.8, 2.5, 4.6, 'https://foodmaster.kz/ru/catalog/foodmaster-riazhenka-25-3'),
  ('product', 'Снежок 2%', 'FoodMaster', 69, 2.8, 2.0, 10.0, 'https://foodmaster.kz/ru/catalog/foodmaster-snezhok-2-4'),
  ('product', 'Молоко 2,5%', 'FoodMaster', 52, 2.8, 2.5, 4.6, 'https://foodmaster.kz/ru/catalog/foodmaster-moloko-25-7'),
  ('product', 'Греческий йогурт натуральный 8,4%', 'FoodMaster', 119, 4.5, 8.4, 6.4, 'https://foodmaster.kz/ru/catalog/foodmaster-grecheskii-iogurt-naturalnyi-84-12'),
  ('product', 'Живой творожок ваниль 4%', 'FoodMaster', 110, 4.5, 4.0, 14.0, 'https://foodmaster.kz/ru/catalog/foodmaster-zhivoi-tvorozhok-vanil-4-11'),
  ('product', 'Живой йогурт питьевой, лесные ягоды', 'FoodMaster', 77.2, 2.8, 2.0, 12.0, 'https://world.openfoodfacts.org/product/4870207314196'),
  ('product', 'Сыр твёрдый Gouda', 'FoodMaster', 364.5, 27.0, 28.5, 0.5, 'https://foodmaster.kz/ru/catalog/tverdyi-syr-gouda-276'),
  ('product', 'Творог домашний рассыпчатый 9%', 'President', 135, 12, 9, 1.5, 'https://foodmaster.kz/ru/catalog/tvorog-president-domashnii-rassypchatyi-9-29'),
  ('product', 'Творог традиционный мягкий 9%', 'President', 137, 12, 9, 2, 'https://foodmaster.kz/ru/catalog/tvorog-president-traditsionnyi-miagkii-9-31'),
  ('product', 'Сметана 20%', 'President', 205, 2.4, 20.0, 3.8, 'https://foodmaster.kz/ru/catalog/smetana-president-20-33'),
  ('product', 'Сливки 23%', 'President', 232, 2.5, 23.0, 3.7, 'https://foodmaster.kz/ru/catalog/slivki-president-23-34'),
  ('product', 'Масло сливочное 82%', 'President', 745, 0.7, 82.0, 1.0, 'https://foodmaster.kz/ru/catalog/maslo-president-slivochnoe-82-35'),
  ('product', 'Сыр творожный', 'President', 199, 7.5, 17.0, 4.0, 'https://foodmaster.kz/ru/catalog/tvorozhnyi-syr-president-280'),
  ('product', 'Брынза 45%', 'President', 213, 12.0, 16.7, 3.7, 'https://foodmaster.kz/ru/catalog/syr-rassolnyi-president-brynza-45-45'),
  ('product', 'Сыр Мааздам 48%', 'President', 368, 29, 28, 0, 'https://foodmaster.kz/ru/catalog/syr-tverdyi-president-maazdam-48-50'),
  ('product', 'Моцарелла мини 45%', 'Galbani', 242, 18, 18, 2, 'https://foodmaster.kz/ru/catalog/syr-galbani-motsarella-mini-45-53'),
  ('product', 'Шоколад «Казахстанский»', 'Рахат', 532, 6.3, 33.4, 52.7, 'https://www.rakhat.kz/products/shokolad/shokolad-temnyj/kazahstanskij-3/'),
  ('product', 'Шоколад Rakhat 70% cocoa', 'Рахат', 567, 8.9, 42.3, 38.3, 'https://www.rakhat.kz/products/shokolad/shokolad-chernyj/rakhat-70-6/'),
  ('product', 'Шоколад «Almaty» пористый молочный', 'Рахат', 539, 5.4, 33.4, 54.8, 'https://www.rakhat.kz/products/shokolad/shokolad-vozdushnyj/almaty-4/'),
  ('product', 'Шоколад молочный «Айналайын»', 'Рахат', 552, 6.8, 36.0, 52.5, 'https://www.rakhat.kz/products/shokolad/shokolad-molochnyj/molochnyj-shokolad-ajnalajyn-2/'),
  ('product', 'Шоколад «Тысяча и одна ночь»', 'Рахат', 534, 5.8, 33.4, 53.9, 'https://www.rakhat.kz/products/shokolad/shokolad-bez-dobavok/tysyacha-i-odna-noch-2/'),
  ('product', 'Конфеты «Птичье молоко»', 'Рахат', 474, 2.8, 25.5, 59.3, 'https://www.rakhat.kz/products/candies/shokoladnye-konfety-v-hudozhestvennyh-korobkah/ptiche-moloko/'),
  ('product', 'Конфеты «Умка»', 'Рахат', 530, 8.7, 32.1, 56.5, 'https://www.rakhat.kz/products/candies/konfety-glazirovannye-s-nachinkoj-mezhdu-sloyami-vafel/umka/'),
  ('product', 'Конфеты «Sary-Arka» со сгущённым молоком', 'Рахат', 389, 2.5, 9.4, 77.6, 'https://www.rakhat.kz/products/candies/konfety-glazirovannye-s-pomadnym-korpusom/sary-arka-so-sgushhyonnym-molokom/'),
  ('product', 'Печенье RAKHAT BAKERY шоколадно-сливочное', 'Рахат', 475, 6.1, 23.3, 59.3, 'https://www.rakhat.kz/products/pechene/pechene-otsadnoe/rakhat-bakery-s-shokoladno-slivochnym-vkusom/'),
  ('product', 'Паста шоколадно-ореховая', 'Рахат', 542, 7.1, 34.6, 52.0, 'https://world.openfoodfacts.org/product/4870208437818'),
  ('product', 'Паста шоколадно-ореховая с фундуком', 'Рахат', 555, 5.4, 36.3, 52.7, 'https://world.openfoodfacts.org/product/4870208435265'),
  ('product', 'Молоко питьевое ультрапастеризованное', 'Айналайын', 52.5, 2.8, 2.5, 4.7, 'https://world.openfoodfacts.org/product/4870003431646'),
  ('product', 'Мороженое пломбир «Как раньше»', 'Шин-Лайн', 207, 2.9, 12.0, 22.4, 'https://world.openfoodfacts.org/product/4870233462472'),
  ('product', 'Мороженое «Байтерек»', 'Шин-Лайн', 180, 4.6, 7.9, 22.5, 'https://world.openfoodfacts.org/product/4870233461758'),
  ('product', 'Мороженое «Бомба конус XXL» клубника', 'Шин-Лайн', 260, 3.7, 12.1, 34.2, 'https://world.openfoodfacts.org/product/4870004909939')
on conflict do nothing;

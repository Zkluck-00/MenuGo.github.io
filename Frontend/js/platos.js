// MenuGo - datos de platos de la carta
// Este archivo contiene datos compartidos para menú local y menú para llevar.

const categorias = [
  { id: "todas", nombre: "Todas" },
  { id: "ceviches", nombre: "Ceviches y más" },
  { id: "tiraditos", nombre: "Tiraditos" },
  { id: "leches", nombre: "Leches de tigre" },
  { id: "causas", nombre: "Causas" },
  { id: "duo", nombre: "Dúo marino" },
  { id: "rondas", nombre: "Rondas" },
  { id: "chicharron", nombre: "Chicharrón" },
  { id: "jalea", nombre: "Jalea" },
  { id: "sudados", nombre: "Sudados" },
  { id: "entradas", nombre: "Entradas" },
  { id: "arroces", nombre: "Arroces" },
  { id: "especiales", nombre: "Especiales" },
  { id: "parrillas", nombre: "Parrillas" },
  { id: "bebidas", nombre: "Bebidas sin alcohol" },
  { id: "gaseosa", nombre: "Gaseosas" },
];

const opcionesAji = ["Con ají", "Sin ají"];
const opcionesSinAji = ["Preparación normal", "Sin ají"];
const normal = ["Preparación normal"];
const LIMITE_OPCIONES_PRODUCTO = 2;
const opcionesBebidaFria = ["Helada", "Sin helar", "Con hielo aparte"];

const GRUPOS_OPCIONES_EXCLUYENTES_MENUGO = [
  ["Helada", "Sin helar"],
  ["Con ají", "Sin ají", "Poco picante"],
  ["Preparación normal", "Sin ají", "Poco picante"],
  ["Normal", "Sin azúcar"],
];

function opcionesSonExcluyentesMenuGo(opcionA, opcionB) {
  const claveA = normalizarTextoMenuGo(opcionA);
  const claveB = normalizarTextoMenuGo(opcionB);
  if (!claveA || !claveB || claveA === claveB) return false;

  return GRUPOS_OPCIONES_EXCLUYENTES_MENUGO.some((grupo) => {
    const clavesGrupo = grupo.map((opcion) => normalizarTextoMenuGo(opcion));
    return clavesGrupo.includes(claveA) && clavesGrupo.includes(claveB);
  });
}

function validarOpcionesProductoMenuGo(name, checkbox, limite = LIMITE_OPCIONES_PRODUCTO) {
  const opciones = Array.from(document.getElementsByName(name));

  if (checkbox?.checked) {
    opciones.forEach((opcion) => {
      if (opcion !== checkbox && opcion.checked && opcionesSonExcluyentesMenuGo(checkbox.value, opcion.value)) {
        opcion.checked = false;
      }
    });
  }

  const seleccionadas = opciones.filter((opcion) => opcion.checked);
  if (seleccionadas.length <= limite) return true;

  checkbox.checked = false;
  alert(`Solo puedes escoger hasta ${limite} opciones por producto.`);
  return false;
}


const IMAGEN_PLATO_PLACEHOLDER =
  "https://placehold.co/600x400/f8fafc/334155?text=Foto+del+plato";

const imagenesProductos = {
  "cev-001": "https://jameaperu.com/assets/images/2026/03/ceviche-de-caballa_800x534.webp", // Ceviche de caballa
  "cev-002": "https://micevichedehoy.com/assets/images/ceviche-de-pescado_800x534.webp", // Ceviche de filete
  "cev-003": "https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg", // Ceviche de cabrillón
  "cev-004": "https://resizer.glanacion.com/resizer/v2/ceviche-mixto-LJZOCGVFLRA2PMPON3P7GVOKZE.jpg?auth=ca0a3f372ba160f268600418a6b1ebc294040d69bb08eee5c4ae4cd47a89beb6&width=880&height=586&quality=70&smart=true", // Ceviche mixto
  "cev-005": "https://micevichedehoy.com/assets/images/ceviche-de-conchas-negras_800x534.webp", // Ceviche conchas negras
  "cev-006": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTZYKSo1gbU6QEgqBCHjB9bnRFUZRXisS-iZA&s", // Ceviche de pulpo
  "cev-007": "https://buenazo.cronosmedia.glr.pe/original/2020/10/09/5f80f0086490fc023e0ac831.jpg", // Ceviche langostino
  "cev-008": "https://img2.rtve.es/n/1628853?w=1600", // Ceviche de mero
  "cev-009": "https://www.shutterstock.com/image-photo/ceviche-mixto-traditional-peruvian-dish-600nw-2582938301.jpg", // Ceviche mixto de filete
  "cev-010": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQI0UXFzfE1kVv0CRqMhN-uw1xM-IhcmGBdwg&s", // Ceviche de calamar
  "cev-011": "https://media-cdn.tripadvisor.com/media/photo-s/10/0a/5d/0e/ceviche-mixto-pescado.jpg", // Ceviche de langostinos
  "cev-012": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRQRi1wxhYSdp_id1zyWVCyrCJhPEI2hC7VDQ&s", // Ceviche de cabrillón con conchas negras
  "cev-013": "https://media-cdn.tripadvisor.com/media/photo-s/12/cf/27/a9/ceviche-clasico-pescado.jpg", // Ceviche de mero con conchas negras
  "cev-014": "https://comidasperuanas.net/wp-content/uploads/2024/04/Receta-de-Ceviche-de-Cabrilla.jpg", // Ceviche de cabrilla
  "cev-015": "https://jameaperu.com/assets/images/conchitas-a-la-parmesana_800x534.webp", // Conchas a la parmesana
  "cev-016": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1Y2_uIubUM5q5duePMkC4j3a_wKLiPiH0eg&s", // Choros a la chalaca
  "cev-017": "https://www.recetasnestle.com.ec/sites/default/files/srh_recipes/3ed7da39f9c6e65b81eedfebfd0e2403.jpg", // Conchas negras asadas
  "cev-018": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQLG0RKYESFV83wxlyLFZ0k_vT47ysit3MfgA&s", // Ceviche crocante
  "tir-001": "https://www.comida-peruana.com/base/stock/Recipe/tiradito/tiradito_web.jpg", // Tiradito clásico
  "tir-002": "https://blog.renaware.com/wp-content/uploads/2018/01/Tiradito-3779-new-logo.jpg", // Tiradito amarillo
  "tir-003": "https://tofuu.getjusto.com/orioneat-local/resized2/H6YJvNpSRMKGdcM5E-300-x.webp", // Tiradito rocotero
  "tir-004": "https://okamisushibar.com/wp-content/uploads/2023/12/TIRADITO-NIKKEI.jpg", // Tiradito Nikei
  "tir-005": "https://tofuu.getjusto.com/orioneat-local/resized2/wYtSHqGgtTgj8x9FW-2400-x.webp", // Tiradito tricolor
  "lec-001": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRkz_WEUFsAkGH8qtOnmS6rHC1vFb08ZU4O5g&s", // Leche tigre clásico
  "lec-002": "https://tofuu.getjusto.com/orioneat-local/resized2/94Gv7PzB9ffusmeFH-2400-x.webp", // Leche tigre de la casa
  "cau-001": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSpudShwld8HmX1ar-bze25hOoOEuqo7f4QEg&s", // Causa acevichada
  "cau-002": "https://www.laylita.com/recetas/wp-content/uploads/2025/02/Causa-de-camaron-receta-facil-1024x768.jpg", // Causa en salsa de mariscos
  "cau-003": "https://i.ytimg.com/vi/AjSVuWWBdOc/maxresdefault.jpg", // Causa con pulpo al olivo
  "cau-004": "https://lacamara.pe/wp-content/uploads/2023/07/causa-crocante-de-tuna.jpg", // Causa crocante
  "cau-005": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ9mE0OsUutmi9Cy63g1wZr1L6oCU1Q5ax81w&s", // Causa con langostinos en salsa golf
  "cau-006": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQbrqr3CG3ZiL65c24eb104oddzN3ZKNWh6mA&s", // Causa de pollo
  "cau-007": "https://tofuu.getjusto.com/orioneat-local/resized2/ALE9ZMgyoEaHQKuSd-512-x.webp", // Trilogía de causas
  "ron-001": "https://media-cdn.tripadvisor.com/media/photo-s/19/e5/1a/6b/ronda-criolla-piurana.jpg", // Ronda criolla
  "ron-002": "https://media-cdn.tripadvisor.com/media/photo-m/1280/18/24/c6/58/ronda-marina-una-delicia.jpg", // Ronda marina
  "ron-003": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTQyK1qm20QIHVO_Usc-XqQ0cxbk-9vJ8pz6g&s", // Carrusel marino
  "chi-001": "https://especiasmontero.com/wp-content/uploads/2023/04/Chicharrones-de-Mero-1.jpg", // Chicharrón de mero
  "chi-002": "https://berypez.pe/wp-content/uploads/2024/05/p03-fuente-chicharron-mixto.webp", // Chicharrón mixto
  "chi-003": "https://i.ytimg.com/vi/qSwHv_Hl6DA/sddefault.jpg", // Chicharrón de filete
  "chi-004": "https://i.ytimg.com/vi/CYAUf6A3cSI/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLDwg9wDOTNyVoQOQ01W2nPx8uz2JA", // Chicharrón de pollo
  "chi-005": "https://es.cravingsjournal.com/wp-content/uploads/2018/07/chicharron-de-calamar-3.jpg", // Chicharrón de calamar
  "chi-006": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQdAGChGoJDQJTJuQ39YluQCANMo16otMOZHg&s", // Chicharrón de langostinos
  "chi-007": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQuydMsUL2riJmv4MIi1deBG9lr65SEGVmcEQ&s", // Chicharrón de pulpo
  "jal-001": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQaA81SuYQtkfk8Jmr9zgslfQrAKlkCkVmvnQ&s", // Jalea de mero
  "jal-002": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcScyKY-QTut4wqK9kGVcWmQMMwymPNRU7rFog&s", // Jalea mixta
  "jal-003": "https://tofuu.getjusto.com/orioneat-local/resized2/ZAdawpRHo6AEpZHEz-2400-x.webp", // Jalea de cabrilla
  "sud-001": "https://origin.cronosmedia.glr.pe/large/2021/03/18/lg_605360564332ac2dfc54e0cb.jpg", // Sudado de mero
  "sud-002": "https://tofuu.getjusto.com/orioneat-local/resized2/f8qeDQWCCY3dmPvBA-2400-x.webp", // Sudado de cabrillón  
  "sud-003": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQDmc4nufr8H3s1eJGObk-t-5-42cvn5QZQ-w&s", // Sudado de cabrilla
  "sud-004": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRO0c_s2kYyDbCc_CPOtAoReeADBMRXNfkWlA&s", // Chupe de langostinos
  "sud-005": "https://www.machupicchu.biz/imagenes/articulos/chupe-de-cangrejo-con-huevo.jpg", // Chupe de cangrejo
  "sud-006": "https://comedera.com/wp-content/uploads/sites/9/2022/01/parihuela.jpg", // Parihuela de mero
  "sud-007": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTXwUNEQFvmOeYrHA1R2IOGDwIWpQPCdGhkGA&s", // Parihuela de cabrillón
  "sud-008": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQhp-BMee0q41Z4IWUTZPCjRmwdFS7ciP1X8A&s", // Pasado de cabrillón
  "sud-009": "https://media-cdn.tripadvisor.com/media/photo-s/09/fb/ab/dc/el-ganso-azul.jpg", // Pasado de mero
  "ent-001": "https://jameaperu.com/assets/images/tequenos_800x534.webp", // Tequeños
  "ent-002": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTLG35XX8rX62tcGXJvh5RhlEqLcTeH6LVhtQ&s", // Pulpo al olivo
  "ent-003": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRupe809kf6Xk-kNVk2sN6KwWBvWA3CBjU9rg&s", // Tamalito verde
  "ent-004": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRMt-wTgx87RaNMkaNKNpJ4yCNk11eCtw2_dw&s", // Papa a la huancaína
  "ent-005": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcT3mZhTC61gTPlAg-AfRRZP5eEfR1dc5fpCQQ&s", // Ocopa
  "arr-001": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSVFi5GZzm4u56E3Cefr0K9YXJf7FisZK21Mw&s", // Arroz con mariscos
  "arr-002": "https://comedera.com/wp-content/uploads/sites/9/2022/02/arroz-chaufa-de-mariscos.jpg", // Chaufa de marisco / carne / pollo
  "arr-003": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcRdptm3dmPqSvSiRyLRwxEFKke7AAlO8JR9gQ&s", // Arroz chaufa especial
  "arr-004": "https://media-cdn.tripadvisor.com/media/photo-s/05/fb/d9/61/cevicheria-restaurant.jpg", // Arroz tumbes con conchas negras
  "arr-005": "https://comedera.com/wp-content/uploads/sites/9/2022/05/aereopuero-receta-peruana.jpg", // Aeropuerto
  "esp-001": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSz70MakVPLF6bDFHbdFCrUXLiSz7JT7Vp2dg&s", // Lomito a lo pobre
  "esp-002": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSPqy9hzvU2R6-8278COnWuaoo6ZQctdaz74g&s", // Fettuccine
  "esp-003": "https://thumbs.dreamstime.com/b/pechugas-de-pollo-asadas-la-parrilla-con-las-patatas-fritas-y-ensalada-del-tomate-bocado-patata-almuerzo-malsano-delicioso-fondo-147048653.jpg ", // Pollo
  "esp-004": "https://alicante.com.ar/wp-content/uploads/2022/06/jpeg-optimizer_iStock-1057832648-1.jpg", // Milanesa de pollo
  "esp-005": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcTUvXMU6nb5Lm0MUZkP5lNMmQ0empa-yZjZtA&s", // Saltado de pollo / Apanado
  "esp-006": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQAA6CfiOkg-Onwvw79VDJSTZxBFQPwmizHtA&s", // Bistec
  "esp-007": "https://es.cravingsjournal.com/wp-content/uploads/2022/09/pulpo-a-la-parrilla-5.jpg", // Pulpo a la parrilla
  "esp-008": "https://es.cravingsjournal.com/wp-content/uploads/2023/08/tacu-tacu-de-frejoles-5.jpg", // Tacu Tacu
  "par-001": "https://elchaparral.com.pe/archivos/producto/25-27-parrilla-familiar-chaparral-muestra.webp", // Parrilla Familiar 
  "par-002": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcR1jAuSAFUn6QB0ynGArCiCM-q_R5OO4D3dBg&s", //  Combo Parrillero
  "par-003": "https://elchaparral.com.pe/archivos/producto/30-32-churrasco-a-la-parrilla-muestra.webp", // Churrasco a la parrilla
  "par-004": "https://comedera.com/wp-content/uploads/sites/9/2022/03/Anticucho-shutterstock_185287433.jpg", // Anticuchos a la parrilla
  "beb-001": "https://cdn0.uncomo.com/es/posts/8/2/8/como_hacer_jugo_de_fresa_28828_600.jpg", // Jugo de fresa
  "beb-002": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSk0yFMuGeW1TwNlxBdnWtEBbewLvHzRnxrnQ&s", // Jugo de fresa con leche
  "beb-003": "https://www.laylita.com/recetas/wp-content/uploads/2016/09/Jugo-de-pina-casero.jpg", // Jugo de piña
  "beb-004": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSddhAQe8yteIOqH0BM_U5BMwamCF4Z8wme2g&s", // Jugo de maracuyá
  "beb-005": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQjakEM64nsp_GqF2LAf-LoyLinMO1lPNpNKQ&s", // Chicha morada
  "beb-006": "https://www.gastrolabweb.com/u/fotografias/m/2021/5/2/f1280x720-12606_144281_5050.jpg", // Limonada clásica
  "beb-007": "https://comidasperuanas.net/wp-content/uploads/2023/09/Receta-de-Limonada-de-Hierba-Luisa.jpg", // Limonada con hierba luisa
  "beb-008": "https://i.ytimg.com/vi/1I0MlrojsRY/hq720.jpg?sqp=-oaymwEhCK4FEIIDSFryq4qpAxMIARUAAAAAGAElAADIQj0AgKJD&rs=AOn4CLBbTThXxB1rZALTDjcdumfu1xq3Sw", // Maracumango
  "beb-009": "https://www.infobae.com/resizer/v2/IDNEPYYXRJBFHBLLZZ5BO5OJDY.jpg?auth=dad66630ffc1b14e481b147e19b61f8c5600fa5bc65202fd671c31ab759f8981&smart=true&width=1024&height=512&quality=85", // Agua de jamaica
  "gas-001": "https://tofuu.getjusto.com/orioneat-local/resized2/yuHehhyqJDhbF8G34-1000-x.webp", // Inca Kola / Coca-Cola 3 lt
  "gas-002": "https://media.falabella.com/tottusPE/43620260_1/w=1004,h=1500,fit=pad", // Inca Kola / Coca-Cola 1.5 lt
  "gas-003": "https://tofuu.getjusto.com/orioneat-local/resized2/cazqzcXKSDScYnKqr-1000-x.webp", // Gaseosa personal
  "gas-004": "https://miamarket.pe/assets/uploads/ef0ae3f32f287a43a30dd6f986c1e9dc.jpg", // Agua san Luis 1 lt
  "duo-001": "https://media-cdn.tripadvisor.com/media/photo-s/1b/2e/58/5d/combinado-clasico-arroz.jpg", // Arroz con mariscos + ceviche
  "duo-002": "https://tofuu.getjusto.com/orioneat-local/resized2/bEk3uoXmnpgCGqoCk-2400-x.webp", // Arroz con mariscos + chicharrón de filete
  "duo-003": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQloCS-diZBHZHaNxRgOwvBd7idH1YVTDDICA&s", // Arroz con mariscos + causa acevichada
  "duo-004": "https://walac.pe/wp-content/uploads/2024/01/Prepara-un-delicioso-duo-norteno.png", // Chicharrón de filete + ceviche
  "duo-005": "https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcQ6RAay2taIMb7cT_io2AdcYZKTSZfokl4XBA&s", // Chicharrón de filete + causa acevichada
  "duo-006": "https://acomer.pe/wp-content/uploads/2017/07/causaacebichadaweb.jpg", // Causa acevichada + ceviche
};


function normalizarTextoMenuGo(valor) {
  return String(valor || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function deduplicarOpcionesMenuGo(opciones) {
  const vistas = new Set();
  return (Array.isArray(opciones) ? opciones : [])
    .map((opcion) => String(opcion || "").trim())
    .filter(Boolean)
    .filter((opcion) => {
      const clave = normalizarTextoMenuGo(opcion);
      if (vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    });
}

function buscarProductoLocalMenuGo(producto) {
  if (!Array.isArray(productosMenu)) return null;

  const posiblesIds = [
    producto?.id,
    producto?.codigo_producto,
    producto?.codigo_plato,
    producto?.codigo_bebida,
    producto?.id_producto,
    producto?.codigo,
  ]
    .map((valor) => String(valor || "").trim())
    .filter(Boolean);

  const porId = productosMenu.find((item) => posiblesIds.includes(String(item.id)));
  if (porId) return porId;

  const nombre = normalizarTextoMenuGo(producto?.nombre);
  if (!nombre) return null;

  return productosMenu.find((item) => normalizarTextoMenuGo(item.nombre) === nombre) || null;
}

function opcionesInferidasMenuGo(producto) {
  const categoria = normalizarTextoMenuGo(producto?.categoria || producto?.tipo_producto || producto?.tipo);
  const nombre = normalizarTextoMenuGo(producto?.nombre);

  if (categoria.includes("gaseosa") || /gaseosa|inka|coca|agua|san luis|botella/.test(nombre)) {
    return opcionesBebidaFria;
  }

  if (categoria.includes("bebida") || /jugo|limonada|\bchicha\b|maracuya|jamaica|refresco/.test(nombre)) {
    return ["Normal", "Sin azúcar", "Helada", "Sin helar"];
  }

  if (/ceviche|tiradito|leche/.test(categoria) || /ceviche|tiradito|leche de tigre/.test(nombre)) {
    return ["Preparación normal", "Sin ají", "Sin cebolla", "Sin culantro"];
  }

  if (/chicharron|jalea/.test(categoria) || /chicharron|jalea|crocante/.test(nombre)) {
    return ["Normal", "Bien crocante", "Salsa aparte"];
  }

  if (/sudado/.test(categoria) || /sudado|chupe|parihuela|pasado/.test(nombre)) {
    return ["Normal", "Poco picante", "Sin ají"];
  }

  if (/arroz/.test(categoria) || /arroz|chaufa|aeropuerto/.test(nombre)) {
    return ["Normal", "Sin sillao", "Sin cebolla china"];
  }

  if (/causa/.test(categoria) || /causa/.test(nombre)) {
    return ["Preparación normal", "Crema aparte", "Sin ají"];
  }

  if (/entrada/.test(categoria) || /tequeno|pulpo|tamal|huancaina|ocopa/.test(nombre)) {
    return ["Preparación normal", "Salsa aparte", "Sin ají"];
  }

  if (/duo|ronda|especial|parrilla/.test(categoria)) {
    return ["Preparación normal", "Salsa aparte", "Sin ají"];
  }

  return ["Preparación normal"];
}

function opcionesProductoMenuGo(producto) {
  const propias = deduplicarOpcionesMenuGo(producto?.opciones);
  const esSoloNormal = propias.length === 1 && normalizarTextoMenuGo(propias[0]) === "preparacion normal";
  if (propias.length > 0 && !esSoloNormal) return propias;

  const productoLocal = buscarProductoLocalMenuGo(producto);
  const opcionesLocales = deduplicarOpcionesMenuGo(productoLocal?.opciones);
  if (opcionesLocales.length > 0) return opcionesLocales;

  return opcionesInferidasMenuGo(producto);
}

function p(
  id,
  categoria,
  nombre,
  descripcion,
  variantes,
  opciones,
  imagen = "",
) {
  return {
    id,
    categoria,
    nombre,
    descripcion,
    variantes,
    opciones,
    imagen: imagen || imagenesProductos[id] || IMAGEN_PLATO_PLACEHOLDER,
  };
}

const productosMenu = [
  // CEVICHES Y MAS
  p(
    "cev-001",
    "ceviches",
    "Ceviche de caballa",
    "Pescado fresco marinado en limón, cebolla y culantro.",
    [{ nombre: "Único", precio: 29 }],
    opcionesAji,
  ),
  p(
    "cev-002",
    "ceviches",
    "Ceviche de filete",
    "Filete fresco en leche de tigre clásica de la casa.",
    [{ nombre: "Único", precio: 29 }],
    opcionesAji,
  ),
  p(
    "cev-003",
    "ceviches",
    "Ceviche de cabrillón",
    "Cabrillón fresco con limón, cebolla y guarnición marina.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    opcionesAji,
  ),
  p(
    "cev-004",
    "ceviches",
    "Ceviche mixto",
    "Pescado y mariscos frescos marinados al momento.",
    [
      { nombre: "Chico", precio: 59 },
      { nombre: "Grande", precio: 89 },
    ],
    opcionesAji,
  ),
  p(
    "cev-005",
    "ceviches",
    "Ceviche conchas negras",
    "Conchas negras con limón, cebolla y sabor intenso norteño.",
    [
      { nombre: "Chico", precio: 30 },
      { nombre: "Grande", precio: 55 },
    ],
    opcionesAji,
  ),
  p(
    "cev-006",
    "ceviches",
    "Ceviche de pulpo",
    "Pulpo en láminas con leche de tigre y toque cítrico.",
    [
      { nombre: "Chico", precio: 35 },
      { nombre: "Grande", precio: 50 },
    ],
    opcionesAji,
  ),
  p(
    "cev-007",
    "ceviches",
    "Ceviche langostino",
    "Langostinos frescos marinados con limón y culantro.",
    [
      { nombre: "Chico", precio: 35 },
      { nombre: "Grande", precio: 50 },
    ],
    opcionesAji,
  ),
  p(
    "cev-008",
    "ceviches",
    "Ceviche de mero",
    "Mero fresco con preparación clásica de cevichería.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    opcionesAji,
  ),
  p(
    "cev-009",
    "ceviches",
    "Ceviche mixto de filete",
    "Filete con mariscos en leche de tigre tradicional.",
    [{ nombre: "Único", precio: 39 }],
    opcionesAji,
  ),
  p(
    "cev-010",
    "ceviches",
    "Ceviche de calamar",
    "Calamar fresco con limón, cebolla y culantro.",
    [
      { nombre: "Chico", precio: 35 },
      { nombre: "Grande", precio: 45 },
    ],
    opcionesAji,
  ),
  p(
    "cev-011",
    "ceviches",
    "Ceviche de langostinos",
    "Langostinos marinados en limón y leche de tigre.",
    [
      { nombre: "Chico", precio: 35 },
      { nombre: "Grande", precio: 50 },
    ],
    opcionesAji,
  ),
  p(
    "cev-012",
    "ceviches",
    "Ceviche de cabrillón con conchas negras",
    "Cabrillón con conchas negras y sabor marino intenso.",
    [{ nombre: "Único", precio: 64 }],
    opcionesAji,
  ),
  p(
    "cev-013",
    "ceviches",
    "Ceviche de mero con conchas negras",
    "Mero fresco combinado con conchas negras.",
    [{ nombre: "Único", precio: 64 }],
    opcionesAji,
  ),
  p(
    "cev-014",
    "ceviches",
    "Ceviche de cabrilla",
    "Cabrilla fresca en leche de tigre tradicional.",
    [
      { nombre: "Chico", precio: 39 },
      { nombre: "Grande", precio: 49 },
    ],
    opcionesAji,
  ),
  p(
    "cev-015",
    "ceviches",
    "Conchas a la parmesana",
    "Conchas gratinadas con queso parmesano.",
    [{ nombre: "Único", precio: 33 }],
    normal,
  ),
  p(
    "cev-016",
    "ceviches",
    "Choros a la chalaca",
    "Choros con cebolla, tomate, limón y maíz.",
    [{ nombre: "Único", precio: 20 }],
    opcionesAji,
  ),
  p(
    "cev-017",
    "ceviches",
    "Conchas negras asadas",
    "Conchas negras asadas con sazón de la casa.",
    [{ nombre: "Único", precio: 24 }],
    opcionesAji,
  ),
  p(
    "cev-018",
    "ceviches",
    "Ceviche crocante",
    "Ceviche con textura crocante y leche de tigre.",
    [{ nombre: "Único", precio: 35 }],
    opcionesAji,
  ),
  
  // TIRADITOS
  p(
    "tir-001",
    "tiraditos",
    "Tiradito clásico",
    "Láminas de pescado con limón y sazón clásica.",
    [{ nombre: "Único", precio: 30 }],
    ["Sin crema, solo limón", "Con ají", "Sin ají"],
  ),
  p(
    "tir-002",
    "tiraditos",
    "Tiradito amarillo",
    "Pescado en crema suave de ají amarillo.",
    [{ nombre: "Único", precio: 34 }],
    ["Bajo en crema de ají amarillo", "Con ají", "Sin ají"],
  ),
  p(
    "tir-003",
    "tiraditos",
    "Tiradito rocotero",
    "Láminas de pescado con crema de rocoto.",
    [{ nombre: "Único", precio: 34 }],
    ["Poco picante", "Muy picante"],
  ),
  p(
    "tir-004",
    "tiraditos",
    "Tiradito Nikei",
    "Tiradito con toque oriental, soya y kión.",
    [{ nombre: "Único", precio: 35 }],
    ["Preparación normal", "Sin sillao", "Sin jengibre", "Sin ajonjolí"],
  ),
  p(
    "tir-005",
    "tiraditos",
    "Tiradito tricolor",
    "Tres cremas de la casa sobre pescado fresco.",
    [{ nombre: "Único", precio: 38 }],
    ["Preparación normal", "Separar las cremas", "Con ají", "Sin ají"],
  ),

  // LECHES DE TIGRE
  p(
    "lec-001",
    "leches",
    "Leche tigre clásico",
    "Leche de tigre cítrica con guarnición marina.",
    [{ nombre: "Único", precio: 20 }],
    ["Con ají", "Sin ají", "Sin cebolla", "Sin brocheta de chicharrón"],
  ),
  p(
    "lec-002",
    "leches",
    "Leche tigre de la casa",
    "Versión especial con mariscos crocantes.",
    [{ nombre: "Único", precio: 29 }],
    [
      "Con ají",
      "Sin ají",
      "Sin mariscos crocantes",
      "Bajo en pasta de ají escabeche",
    ],
  ),
  
  // CAUSAS
  p(
    "cau-001",
    "causas",
    "Causa acevichada",
    "Causa de papa amarilla con topping acevichado.",
    [{ nombre: "Único", precio: 28 }],
    ["Preparación normal", "Sin ají", "Sin cebolla"],
  ),
  p(
    "cau-002",
    "causas",
    "Causa en salsa de mariscos",
    "Causa cubierta con salsa cremosa de mariscos.",
    [{ nombre: "Único", precio: 29 }],
    ["Preparación normal", "Salsa aparte", "Sin ají"],
  ),
  p(
    "cau-003",
    "causas",
    "Causa con pulpo al olivo",
    "Causa con pulpo y crema al olivo.",
    [{ nombre: "Único", precio: 28 }],
    ["Preparación normal", "Crema aparte", "Sin aceituna"],
  ),
  p(
    "cau-004",
    "causas",
    "Causa crocante",
    "Causa con topping crocante de la casa.",
    [{ nombre: "Único", precio: 28 }],
    ["Preparación normal", "Crocante aparte", "Sin ají"],
  ),
  p(
    "cau-005",
    "causas",
    "Causa con langostinos en salsa golf",
    "Causa con langostinos y salsa golf.",
    [{ nombre: "Único", precio: 29 }],
    ["Preparación normal", "Salsa aparte", "Sin ají"],
  ),
  p(
    "cau-006",
    "causas",
    "Causa de pollo",
    "Causa clásica rellena de pollo.",
    [{ nombre: "Único", precio: 28 }],
    ["Preparación normal", "Sin mayonesa", "Sin ají"],
  ),
  p(
    "cau-007",
    "causas",
    "Trilogía de causas",
    "Tres causas variadas para compartir.",
    [{ nombre: "Único", precio: 38 }],
    ["Preparación normal", "Salsas aparte", "Sin ají"],
  ),

  // DUO MARINO
p(
    "duo-001",
    "duo",
    "Arroz con mariscos + ceviche",
    "Combinación marina.",
    [
       { nombre: "Chico", precio: 40 },
       { nombre: "Grande", precio: 60 }
    ],
    ["Con ají", "Sin ají"],
  ),


  p(
    "duo-002",
    "duo",
    "Arroz con mariscos + chicharrón de filete",
    "Combinación marina.",
       [
       { nombre: "Chico", precio: 40 },
       { nombre: "Grande", precio: 60 }
    ],
     ["Con ají", "Sin ají"],
  ),

  p(
    "duo-003",
    "duo",
    "Arroz con mariscos + causa acevichada",
    "Combinación marina.",
    [
      { nombre: "Chico", precio: 40 },
      { nombre: "Grande", precio: 60 }
    ],
    ["Con ají", "Sin ají"],
  ),


  p(
    "duo-004",
    "duo",
    "Chicharrón de filete + ceviche",
    "Combinación marina.",
    [
      { nombre: "Chico", precio: 40 },
      { nombre: "Grande", precio: 60 }
    ],
    ["Con ají", "Sin ají"],
  ),
  p(
    "duo-005",
    "duo",
    "Chicharrón de filete + causa acevichada",
    "Combinación marina.",
    [
      { nombre: "Chico", precio: 40 },
      { nombre: "Grande", precio: 60 }
    ],
    ["Con ají", "Sin ají"],
  ),

  p(
    "duo-006",
    "duo",
    "Causa acevichada + ceviche",
    "Combinación marina.",
    [
      { nombre: "Chico", precio: 40 },
      { nombre: "Grande", precio: 60 }
    ],
    ["Con ají", "Sin ají"],
  ),

  

  // RONDAS
  p(
    "ron-001",
    "rondas",
    "Ronda criolla",
    "Piqueo criollo variado para compartir.",
    [
      { nombre: "Chico", precio: 69 },
      { nombre: "Grande", precio: 89 },
    ],
    normal,
  ),
  p(
    "ron-002",
    "rondas",
    "Ronda marina",
    "Selección marina variada para compartir.",
    [
      { nombre: "Chico", precio: 69 },
      { nombre: "Grande", precio: 89 },
    ],
    opcionesSinAji,
  ),
  p(
    "ron-003",
    "rondas",
    "Carrusel marino",
    "Gran selección marina para grupo.",
    [{ nombre: "Único", precio: 119 }],
    opcionesSinAji,
  ),

  // CHICHARRON
  
  p(
    "chi-001",
    "chicharron",
    "Chicharrón de mero",
    "Mero frito crocante con sazón marina.",
    [
      { nombre: "Chico", precio: 50 },
      { nombre: "Grande", precio: 70 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-002",
    "chicharron",
    "Chicharrón de mixto",
    "Mariscos mixtos crocantes para compartir.",
    [
      { nombre: "Chico", precio: 60 },
      { nombre: "Grande", precio: 80 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-003",
    "chicharron",
    "Chicharrón de filete",
    "Filete de pescado crocante.",
    [
      { nombre: "Chico", precio: 29 },
      { nombre: "Grande", precio: 49 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-004",
    "chicharron",
    "Chicharrón de pollo",
    "Pollo crocante con guarnición.",
    [
      { nombre: "Chico", precio: 30 },
      { nombre: "Grande", precio: 45 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-005",
    "chicharron",
    "Chicharrón de calamar",
    "Calamar crocante acompañado de salsa.",
    [
      { nombre: "Chico", precio: 39 },
      { nombre: "Grande", precio: 50 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-006",
    "chicharron",
    "Chicharrón de langostinos",
    "Langostinos crocantes con guarnición.",
    [
      { nombre: "Chico", precio: 39 },
      { nombre: "Grande", precio: 50 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "chi-007",
    "chicharron",
    "Chicharrón de pulpo",
    "Pulpo crocante con salsa de la casa.",
    [
      { nombre: "Chico", precio: 39 },
      { nombre: "Grande", precio: 50 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),

  // JALEA
  
  p(
    "jal-001",
    "jalea",
    "Jalea de mero",
    "Jalea de mero con guarnición marina.",
    [
      { nombre: "Chico", precio: 50 },
      { nombre: "Grande", precio: 70 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "jal-002",
    "jalea",
    "Jalea mixta",
    "Jalea de pescado y mariscos para compartir.",
    [
      { nombre: "Chico", precio: 65 },
      { nombre: "Grande", precio: 85 },
    ],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),
  p(
    "jal-003",
    "jalea",
    "Jalea de cabrilla",
    "Cabrilla crocante con zarza criolla.",
    [{ nombre: "Único", precio: 49 }],
    ["Normal", "Bien crocante", "Salsa aparte"],
  ),

  // SUDADOS
  p(
    "sud-001",
    "sudados",
    "Sudado de mero",
    "Mero sudado con fondo marino y verduras.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-002",
    "sudados",
    "Sudado de cabrillón",
    "Cabrillón en jugo concentrado de la casa.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-003",
    "sudados",
    "Sudado de cabrilla",
    "Cabrilla sudada con verduras y culantro.",
    [{ nombre: "Único", precio: 45 }],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-004",
    "sudados",
    "Sudado de mero a lo macho",
    "Mero en salsa a lo macho con mariscos.",
    [
      { nombre: "Chico", precio: 59 },
      { nombre: "Grande", precio: 89 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-005",
    "sudados",
    "Chupe de langostinos",
    "Chupe cremoso con langostinos.",
    [{ nombre: "Único", precio: 40 }],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-006",
    "sudados",
    "Chupe de cangrejo",
    "Chupe con cangrejo y fondo marino.",
    [{ nombre: "Único", precio: 49 }],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-007",
    "sudados",
    "Parihuela de mero",
    "Sopa marina concentrada con mero.",
    [
      { nombre: "Chico", precio: 59 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-008",
    "sudados",
    "Parihuela de cabrillón",
    "Parihuela norteña con cabrillón.",
    [
      { nombre: "Chico", precio: 59 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-009",
    "sudados",
    "Pasado de cabrillón",
    "Cabrillón pasado en caldo de la casa.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),
  p(
    "sud-010",
    "sudados",
    "Pasado de mero",
    "Mero pasado en caldo marino.",
    [
      { nombre: "Chico", precio: 49 },
      { nombre: "Grande", precio: 79 },
    ],
    ["Normal", "Poco picante", "Sin ají"],
  ),

  // ENTRADAS
  p(
    "ent-001",
    "entradas",
    "Tequeños",
    "Tequeños rellenos para compartir.",
    [{ nombre: "Único", precio: 24 }],
    ["Lomo", "Queso", "Jamón", "Pollo"],
  ),
  p(
    "ent-002",
    "entradas",
    "Pulpo al olivo",
    "Pulpo con salsa cremosa al olivo.",
    [{ nombre: "Único", precio: 30 }],
    ["Normal", "Salsa aparte", "Sin aceituna"],
  ),
  p(
    "ent-003",
    "entradas",
    "Tamalito verde",
    "Tamal verde tradicional servido caliente.",
    [{ nombre: "Único", precio: 10 }],
    normal,
  ),
  p(
    "ent-004",
    "entradas",
    "Papa a la huancaína",
    "Papa con crema huancaína clásica.",
    [{ nombre: "Único", precio: 8 }],
    ["Normal", "Crema aparte", "Sin ají"],
  ),
  p(
    "ent-005",
    "entradas",
    "Ocopa",
    "Papa con crema de ocopa tradicional.",
    [{ nombre: "Único", precio: 8 }],
    ["Normal", "Crema aparte", "Sin ají"],
  ),

  // ARROCES
  p(
    "arr-001",
    "arroces",
    "Arroz con mariscos",
    "Arroz salteado con mariscos y sazón marina.",
    [
      { nombre: "Chico", precio: 30 },
      { nombre: "Grande", precio: 55 },
    ],
    ["Normal", "Sin ají", "Sin culantro"],
  ),
  p(
    "arr-002",
    "arroces",
    "Chaufa de marisco / carne / pollo",
    "Arroz chaufa salteado al wok.",
    [{ nombre: "Único", precio: 24 }],
    ["Marisco", "Carne", "Pollo"],
  ),
  p(
    "arr-003",
    "arroces",
    "Arroz chaufa especial",
    "Chaufa especial con proteína variada.",
    [{ nombre: "Único", precio: 23 }],
    ["Normal", "Sin cebolla china", "Sin sillao"],
  ),
  p(
    "arr-004",
    "arroces",
    "Arroz tumbes con conchas negras",
    "Arroz marino con conchas negras.",
    [
      { nombre: "Chico", precio: 30 },
      { nombre: "Grande", precio: 40 },
    ],
    ["Normal", "Sin ají", "Sin culantro"],
  ),
  p(
    "arr-005",
    "arroces",
    "Aeropuerto",
    "Mezcla de chaufa y tallarín salteado.",
    [
      { nombre: "Pollo", precio: 17 },
      { nombre: "Carne", precio: 20 },
      { nombre: "Cerdo", precio: 22 },
      { nombre: "Especial", precio: 26 },
    ],
    ["Normal", "Sin sillao", "Sin cebolla china"],
  ),

  // ESPECIALES
  p(
    "esp-001",
    "especiales",
    "Lomito a lo pobre",
    "Lomo con huevo, plátano y papas fritas.",
    [{ nombre: "Único", precio: 34 }],
    ["Normal", "Término medio", "Bien cocido"],
  ),
  p(
    "esp-002",
    "especiales",
    "Fettuccine",
    "Pasta cremosa con salsa a elección.",
    [
      { nombre: "Al pesto", precio: 34 },
      { nombre: "A la huancaína", precio: 36 },
    ],
    ["Normal", "Salsa aparte", "Sin queso"],
  ),
  p(
    "esp-003",
    "especiales",
    "Pollo",
    "Pollo servido con guarnición de la casa.",
    [
      { nombre: "A la parrilla", precio: 20 },
      { nombre: "A la plancha", precio: 28 },
    ],
    ["Normal", "Sin ensalada", "Papas aparte"],
  ),
  p(
    "esp-004",
    "especiales",
    "Milanesa de pollo",
    "Milanesa crocante con guarnición.",
    [{ nombre: "Único", precio: 35 }],
    ["Normal", "Bien crocante", "Papas aparte"],
  ),
  p(
    "esp-005",
    "especiales",
    "Saltado de pollo / Apanado",
    "Pollo salteado o apanado según elección.",
    [
      { nombre: "Saltado", precio: 20 },
      { nombre: "Apanado", precio: 20 },
    ],
    ["Normal", "Sin cebolla", "Papas aparte"],
  ),
  p(
    "esp-006",
    "especiales",
    "Bistec",
    "Bistec servido con guarnición criolla.",
    [
      { nombre: "Apanado", precio: 24 },
      { nombre: "A lo pobre", precio: 38 },
    ],
    ["Normal", "Término medio", "Bien cocido"],
  ),
  p(
    "esp-007",
    "especiales",
    "Pulpo a la parrilla",
    "Pulpo a la parrilla con sazón de la casa.",
    [{ nombre: "Único", precio: 30 }],
    ["Normal", "Salsa aparte", "Bien dorado"],
  ),
  p(
    "esp-008",
    "especiales",
    "Tacu Tacu",
    "Tacu tacu con proteína a elección.",
    [
      { nombre: "Lomo", precio: 34 },
      { nombre: "Mariscos", precio: 34 },
    ],
    ["Normal", "Sin ají", "Salsa aparte"],
  ),
  
  // PARRILLAS
  p(
    "par-001",
    "parrillas",
    "Parrilla Familiar ",
    "Parrilla variada para compartir.",
    [{ nombre: "Único", precio: 89 }],
    ["Normal", "Término medio", "Bien cocido"],
  ),
  p(
    "par-002",
    "parrillas",
    "Combo Parrillero",
    "Combo parrillero variado para mesa.",
    [{ nombre: "Único", precio: 89 }],
    ["Normal", "Término medio", "Bien cocido"],
  ),
  p(
    "par-003",
    "parrillas",
    " Churrasco a la parrilla",
    "Corte a la parrilla con guarnición.",
    [{ nombre: "Único", precio: 24 }],
    ["Chuleta", "Churrasco", "Bien cocido"],
  ),
  p(
    "par-004",
    "parrillas",
    "Anticuchos a la parrilla",
    "Anticuchos con papa y salsa.",
    [{ nombre: "Único", precio: 20 }],
    ["Normal", "Sin ají", "Salsa aparte"],
  ),

  // BEBIDAS SIN ALCOHOL
  p(
    "beb-001",
    "bebidas",
    "Jugo de fresa",
    "Jugo natural de fresa preparado al momento.",
    [
      { nombre: "Vaso", precio: 20 },
      { nombre: "Jarra", precio: 22 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-002",
    "bebidas",
    "Jugo de fresa con leche",
    "Fresa licuada con leche.",
    [
      { nombre: "Vaso", precio: 22 },
      { nombre: "Jarra", precio: 24 },
    ],
    ["Sin azúcar", "Regular azúcar", "Helada", "Sin helar", "Con hielo aparte"],
  ),
  p(
    "beb-003",
    "bebidas",
    "Jugo de piña",
    "Jugo natural de piña.",
    [
      { nombre: "Vaso", precio: 17 },
      { nombre: "Jarra", precio: 19 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-004",
    "bebidas",
    "Jugo de maracuyá",
    "Bebida cítrica y refrescante.",
    [
      { nombre: "Vaso", precio: 15 },
      { nombre: "Jarra", precio: 17 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-005",
    "bebidas",
    "Chicha morada",
    "Bebida tradicional de maíz morado.",
    [
      { nombre: "Vaso", precio: 15 },
      { nombre: "Jarra", precio: 17 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-006",
    "bebidas",
    "Limonada clásica",
    "Limonada fresca preparada al momento.",
    [
      { nombre: "Vaso", precio: 15 },
      { nombre: "Jarra", precio: 17 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-007",
    "bebidas",
    "Limonada con hierba luisa",
    "Limonada aromática con hierba luisa.",
    [
      { nombre: "Vaso", precio: 15 },
      { nombre: "Jarra", precio: 17 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-008",
    "bebidas",
    "Maracumango",
    "Mezcla tropical de maracuyá y mango.",
    [
      { nombre: "Vaso", precio: 23 },
      { nombre: "Jarra", precio: 25 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  p(
    "beb-009",
    "bebidas",
    "Agua de jamaica",
    "Refresco natural de jamaica.",
    [
      { nombre: "Vaso", precio: 12 },
      { nombre: "Jarra", precio: 14 },
    ],
    ["Sin azúcar", "Normal", "Helada"],
  ),
  
  // GASEOSA
  p(
    "gas-001",
    "gaseosa",
    "Inca Kola / Coca-Cola 3 lt",
    "Gaseosa familiar de 3 litros.",
    [
      { nombre: "Inca Kola", precio: 15 },
      { nombre: "Coca-Cola", precio: 15 },
    ],
    ["Helada", "Sin helar"],
  ),
  p(
    "gas-002",
    "gaseosa",
    "Inca Kola / Coca-Cola 1.5 lt",
    "Gaseosa familiar de 1.5 litros.",
    [
      { nombre: "Inca Kola", precio: 10 },
      { nombre: "Coca-Cola", precio: 10 },
    ],
    ["Helada", "Sin helar"],
  ),
  p(
    "gas-003",
    "gaseosa",
    "Gaseosa personal",
    "Gaseosa personal a elección.",
    [
      { nombre: "Coca-Cola", precio: 4 },
      { nombre: "Inka Kola", precio: 4 },
    ],
    ["Helada", "Sin helar"],
  ),
  p(
    "gas-004",
    "gaseosa",
    "Agua San Luis 1 lt",
    "Botella de agua.",
    [{ nombre: "Único", precio: 4 }],
    opcionesBebidaFria,

  ),
  
];

// Platos aptos para llevar o recoger. Se excluyen platos delicados,
// con bastante líquido o que dependen mucho de presentación en mesa.
const platosParaLlevar = [
  // Causas
  "cau-001",
  "cau-002",
  "cau-003",
  "cau-004",
  "cau-005",
  "cau-006",
  "cau-007",

  // Dúos aptos para traslado
  "duo-002",
  "duo-003",
  "duo-005",

  // Chicharrones
  "chi-001",
  "chi-002",
  "chi-003",
  "chi-004",
  "chi-005",
  "chi-006",
  "chi-007",

  // Jaleas
  "jal-001",
  "jal-002",
  "jal-003",

  // Entradas
  "ent-001",
  "ent-002",
  "ent-003",
  "ent-004",
  "ent-005",

  // Arroces
  "arr-001",
  "arr-002",
  "arr-003",
  "arr-004",
  "arr-005",

  // Especiales
  "esp-001",
  "esp-002",
  "esp-003",
  "esp-004",
  "esp-005",
  "esp-006",
  "esp-008",

  // Parrillas
  "par-001",
  "par-002",
  "par-003",
  "par-004",

  // Bebidas
  "beb-001",
  "beb-002",
  "beb-003",
  "beb-004",
  "beb-005",
  "beb-006",
  "beb-007",
  "beb-008",
  "beb-009",

  // Gaseosas y aguaf
  "gas-001",
  "gas-002",
  "gas-003",
  "gas-004",
];

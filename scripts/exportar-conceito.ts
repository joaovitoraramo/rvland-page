/* Exporta o conceito publicado em PNG e PDF, desktop e celular, para anexar
   quando o prospect pedir. Renderiza a versão publicada (que já traz o
   crédito da RVLand no rodapé) e esconde só a faixa do topo, que é interface
   de navegação e não faz sentido numa imagem parada.

   Precisa do dev server no ar (npm run dev).
   Uso: npx tsx scripts/exportar-conceito.ts poolguys conceitos/poolguys */
import { chromium, devices } from "playwright";

const SEM_FAIXA = ".rv-faixa { display: none !important; }";

async function main() {
  const [slug, destino] = process.argv.slice(2);
  if (!slug || !destino) throw new Error("uso: exportar-conceito.ts <slug> <pasta-destino>");

  const url = `http://localhost:3000/c/${slug}`;
  const browser = await chromium.launch();

  try {
    // desktop
    const pc = await browser.newPage({ viewport: { width: 1440, height: 1000 }, deviceScaleFactor: 2 });
    await pc.goto(url, { waitUntil: "domcontentloaded" });
    await pc.addStyleTag({ content: SEM_FAIXA });
    await pc.waitForTimeout(3000);
    await pc.screenshot({ path: `${destino}/${slug}-conceito.png`, fullPage: true });
    await pc.screenshot({ path: `${destino}/${slug}-hero.png` });
    const altPc = await pc.evaluate(() => document.documentElement.scrollHeight);

    // celular com emulação de aparelho: viewport estreito não basta, porque
    // não reproduz o viewport de layout de um telefone de verdade
    const ctxFone = await browser.newContext({ ...devices["iPhone 13"], deviceScaleFactor: 2 });
    const fone = await ctxFone.newPage();
    await fone.goto(url, { waitUntil: "domcontentloaded" });
    await fone.addStyleTag({ content: SEM_FAIXA });
    await fone.waitForTimeout(2500);
    await fone.screenshot({ path: `${destino}/${slug}-mobile.png`, fullPage: true });
    const altFone = await fone.evaluate(() => document.documentElement.scrollHeight);

    const pdfPc = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    await pdfPc.goto(url, { waitUntil: "domcontentloaded" });
    await pdfPc.addStyleTag({ content: SEM_FAIXA });
    await pdfPc.waitForTimeout(2500);
    await pdfPc.pdf({
      path: `${destino}/${slug}-conceito.pdf`,
      width: "1440px",
      height: `${altPc}px`,
      printBackground: true,
      pageRanges: "1",
    });

    const ctxPdfFone = await browser.newContext({ ...devices["iPhone 13"] });
    const pdfFone = await ctxPdfFone.newPage();
    await pdfFone.goto(url, { waitUntil: "domcontentloaded" });
    await pdfFone.addStyleTag({ content: SEM_FAIXA });
    await pdfFone.waitForTimeout(2500);
    await pdfFone.pdf({
      path: `${destino}/${slug}-mobile.pdf`,
      width: "390px",
      height: `${altFone}px`,
      printBackground: true,
      pageRanges: "1",
    });

    console.log(`exportado em ${destino}: desktop ${altPc}px, celular ${altFone}px`);
  } finally {
    await browser.close();
  }
}

main().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});

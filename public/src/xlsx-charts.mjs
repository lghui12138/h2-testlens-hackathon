let zipEngine = globalThis.JSZip || null;

export function setZipEngine(engine) {
  zipEngine = engine;
}

const xmlEscape = (value) => String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');
const attr = (tag, name) => (new RegExp(`${name}="([^"]*)"`).exec(tag)?.[1] || '');
const maxIndex = (names, pattern) => Math.max(0, ...names.map((name) => Number(pattern.exec(name)?.[1] || 0)));

function chartXml({ sheetName, title, catRef, valRef, categories, values, categoryNumeric = true }) {
  const cache = (items, numeric) => `<c:${numeric ? 'numCache' : 'strCache'}><c:ptCount val="${items.length}"/>${items.map((value, index) => `<c:pt idx="${index}"><c:v>${xmlEscape(value)}</c:v></c:pt>`).join('')}</c:${numeric ? 'numCache' : 'strCache'}>`;
  const cat = categoryNumeric
    ? `<c:numRef><c:f>${xmlEscape(catRef)}</c:f>${cache(categories, true)}</c:numRef>`
    : `<c:strRef><c:f>${xmlEscape(catRef)}</c:f>${cache(categories, false)}</c:strRef>`;
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><c:chartSpace xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><c:lang val="zh-CN"/><c:chart><c:title><c:tx><c:rich><a:bodyPr/><a:lstStyle/><a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="1200"/><a:t>${xmlEscape(title)}</a:t></a:r><a:endParaRPr lang="zh-CN"/></a:p></c:rich></c:tx><c:layout/></c:title><c:plotArea><c:layout/><c:lineChart><c:grouping val="standard"/><c:ser><c:idx val="0"/><c:order val="0"/><c:tx><c:strRef><c:f>${xmlEscape(sheetName)}!$B$1</c:f><c:strCache><c:ptCount val="1"/><c:pt idx="0"><c:v>${xmlEscape(title)}</c:v></c:pt></c:strCache></c:strRef></c:tx><c:marker><c:symbol val="none"/></c:marker><c:cat>${cat}</c:cat><c:val><c:numRef><c:f>${xmlEscape(valRef)}</c:f>${cache(values, true)}</c:numRef></c:val></c:ser><c:marker val="1"/><c:axId val="50010001"/><c:axId val="50010002"/></c:lineChart><c:catAx><c:axId val="50010001"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="b"/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="50010002"/><c:crosses val="autoZero"/><c:auto val="1"/><c:lblAlgn val="ctr"/><c:lblOffset val="100"/></c:catAx><c:valAx><c:axId val="50010002"/><c:scaling><c:orientation val="minMax"/></c:scaling><c:axPos val="l"/><c:majorGridlines/><c:numFmt formatCode="General" sourceLinked="1"/><c:tickLblPos val="nextTo"/><c:crossAx val="50010001"/><c:crosses val="autoZero"/><c:crossBetween val="between"/></c:valAx></c:plotArea><c:legend><c:legendPos val="r"/><c:layout/></c:legend><c:plotVisOnly val="1"/><c:dispBlanksAs val="gap"/></c:chart></c:chartSpace>`;
}

function drawingXml() {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><xdr:wsDr xmlns:xdr="http://schemas.openxmlformats.org/drawingml/2006/spreadsheetDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><xdr:twoCellAnchor><xdr:from><xdr:col>3</xdr:col><xdr:colOff>0</xdr:colOff><xdr:row>1</xdr:row><xdr:rowOff>0</xdr:rowOff></xdr:from><xdr:to><xdr:col>12</xdr:col><xdr:colOff>304800</xdr:colOff><xdr:row>18</xdr:row><xdr:rowOff>76200</xdr:rowOff></xdr:to><xdr:graphicFrame macro=""><xdr:nvGraphicFramePr><xdr:cNvPr id="2" name="TestLens Chart"/><xdr:cNvGraphicFramePr/></xdr:nvGraphicFramePr><xdr:xfrm><a:off x="0" y="0"/><a:ext cx="5572800" cy="2839320"/></xdr:xfrm><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/chart"><c:chart xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" r:id="rId1"/></a:graphicData></a:graphic></xdr:graphicFrame><xdr:clientData/></xdr:twoCellAnchor></xdr:wsDr>`;
}

export async function addNativeChartToWorkbook(arrayBuffer, dataset = {}) {
  const JSZip = zipEngine || globalThis.JSZip;
  if (!JSZip) return arrayBuffer;
  const zip = await JSZip.loadAsync(arrayBuffer);
  const names = Object.keys(zip.files);
  const workbookXml = await zip.file('xl/workbook.xml').async('string');
  const sheetTag = (workbookXml.match(/<sheet\b[^>]*>/g) || []).find((tag) => attr(tag, 'name') === '图表数据');
  if (!sheetTag) return arrayBuffer;
  const sheetRelId = attr(sheetTag, 'r:id');
  const workbookRels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const workbookRel = (workbookRels.match(/<Relationship\b[^>]*>/g) || []).find((tag) => attr(tag, 'Id') === sheetRelId);
  if (!workbookRel) return arrayBuffer;
  const target = attr(workbookRel, 'Target').replace(/^\/+/, '');
  const sheetPath = target.startsWith('xl/') ? target : `xl/${target}`;
  const sheetFile = zip.file(sheetPath); if (!sheetFile) return arrayBuffer;
  const sheetXml = await sheetFile.async('string');
  const relsPath = `${sheetPath.slice(0, sheetPath.lastIndexOf('/'))}/_rels/${sheetPath.slice(sheetPath.lastIndexOf('/') + 1)}.rels`;
  let sheetRels = zip.file(relsPath) ? await zip.file(relsPath).async('string') : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';
  const relIds = [...sheetRels.matchAll(/Id="rId(\d+)"/g)].map((match) => Number(match[1]));
  const drawingRelId = `rId${Math.max(0, ...relIds) + 1}`;
  const drawingIndex = maxIndex(names, /xl\/drawings\/drawing(\d+)\.xml$/) + 1;
  const chartIndex = maxIndex(names, /xl\/charts\/chart(\d+)\.xml$/) + 1;
  const kind = dataset.kind || 'stack';
  const rows = kind === 'durability' ? (dataset.points || []) : kind === 'vehicle' ? ((dataset.performancePoints?.length ? dataset.performancePoints : dataset.inferredSegments) || []) : (dataset.performancePoints || []);
  if (!rows.length) return arrayBuffer;
  const categoryNumeric = kind !== 'vehicle' || rows.every((row) => Number.isFinite(row.averageCurrentDensity ?? row.averageCurrentA));
  const categories = kind === 'durability' ? rows.map((row) => row.targetPowerKw) : kind === 'vehicle' && !dataset.performancePoints?.length ? rows.map((row) => row.averageCurrentA) : rows.map((row) => row.averageCurrentDensity ?? row.averageCurrentA);
  const values = kind === 'durability' ? rows.map((row) => row.averageCellVoltageMv) : rows.map((row) => row.averageCellVoltageV);
  const dataStart = 2; const dataEnd = dataStart + rows.length - 1;
  const catColumn = kind === 'durability' ? 'A' : 'C'; const valColumn = kind === 'durability' ? 'B' : 'D';
  const title = kind === 'durability' ? '耐久功率点平均单体电压' : kind === 'vehicle' && !dataset.performancePoints?.length ? '车辆描述性候选区间平均单体电压' : '极化曲线平均单体电压';
  const chart = chartXml({ sheetName: '图表数据', title, catRef: `图表数据!$${catColumn}$${dataStart}:$${catColumn}$${dataEnd}`, valRef: `图表数据!$${valColumn}$${dataStart}:$${valColumn}$${dataEnd}`, categories, values, categoryNumeric });
  const drawingPath = `xl/drawings/drawing${drawingIndex}.xml`; const chartPath = `xl/charts/chart${chartIndex}.xml`;
  const drawingRelsPath = `xl/drawings/_rels/drawing${drawingIndex}.xml.rels`;
  zip.file(sheetPath, sheetXml.replace('</worksheet>', `<drawing r:id="${drawingRelId}"/></worksheet>`));
  sheetRels = sheetRels.replace('</Relationships>', `<Relationship Id="${drawingRelId}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/drawing" Target="../drawings/drawing${drawingIndex}.xml"/></Relationships>`);
  zip.file(relsPath, sheetRels);
  zip.file(drawingPath, drawingXml());
  zip.file(drawingRelsPath, '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/chart" Target="../charts/chart' + chartIndex + '.xml"/></Relationships>');
  zip.file(chartPath, chart);
  const contentTypes = await zip.file('[Content_Types].xml').async('string');
  if (!contentTypes.includes(`PartName="/xl/charts/chart${chartIndex}.xml"`)) zip.file('[Content_Types].xml', contentTypes.replace('</Types>', `<Override PartName="/xl/charts/chart${chartIndex}.xml" ContentType="application/vnd.openxmlformats-officedocument.drawingml.chart+xml"/></Types>`));
  return zip.generateAsync({ type: 'arraybuffer', compression: 'DEFLATE' });
}

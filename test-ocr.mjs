async function testOcrEndpoint(endpoint) {
  console.log("Testing:", endpoint);
  const body = {
    request: { productName: "Test", quantity: 1, specs: "" },
    document: { fileName: "test.pdf", contentBase64: "dGVzdA==" }
  };
  try {
    const res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer sk_659ea0617da2442fb11b92978a4e10f04e56461d36a4e5d7b12228cb789bb03c04f32db55e93679e0a404c226b2a07e72a6af8ce95893b6af798cdef3be360bb024tHWQZQQ8tG51MTonUG`
      },
      body: JSON.stringify(body)
    });
    console.log("Status:", res.status);
    const text = await res.text();
    console.log("Response:", text);
  } catch(e) {
    console.error("Error:", e.message);
  }
}

async function runTests() {
  await testOcrEndpoint("https://api.interfaze.ai/v1");
  await testOcrEndpoint("https://api.interfaze.ai/v1/extract");
  await testOcrEndpoint("https://api.interfaze.ai/v1/ocr");
}
runTests();

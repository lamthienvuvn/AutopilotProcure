async function testTinyFish() {
  console.log("Testing TinyFish...");
  const url = "https://agent.tinyfish.ai/v1/automation/run-sse";
  const body = {
    url: "https://example.com/procurement-draft",
    goal: "Return JSON only with keys referenceId and notes.",
    timeout: 120000,
    browser_profile: "lite",
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": "sk-tinyfish-FdZB7Mzs7Ee774y-sPnRtBqJbhtmp326",
        "Accept": "text/event-stream"
      },
      body: JSON.stringify(body)
    });
    console.log("TinyFish status:", res.status);
    const text = await res.text();
    console.log("TinyFish response:", text.substring(0, 500));
  } catch(e) {
    console.error("TinyFish error:", e);
  }
}

async function testOcr() {
  console.log("\nTesting OCR...");
  const url = "https://api.interfaze.ai/v1";
  const body = {
    request: { productName: "Test", quantity: 1, specs: "" },
    document: { fileName: "test.pdf", contentBase64: "dGVzdA==" }
  };
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer sk_659ea0617da2442fb11b92978a4e10f04e56461d36a4e5d7b12228cb789bb03c04f32db55e93679e0a404c226b2a07e72a6af8ce95893b6af798cdef3be360bb024tHWQZQQ8tG51MTonUG`
      },
      body: JSON.stringify(body)
    });
    console.log("OCR status:", res.status);
    const text = await res.text();
    console.log("OCR response:", text.substring(0, 500));
  } catch(e) {
    console.error("OCR error:", e);
  }
}

testTinyFish().then(testOcr);

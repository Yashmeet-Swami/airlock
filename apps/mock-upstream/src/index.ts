import express from "express";

const app = express();
app.use(express.json());

const PORT = Number(process.env.PORT ?? 4000);

app.all("/*splat", (req, res) => {
  res.status(200).json({
    echo: true,
    method: req.method,
    path: req.originalUrl,
    headers: req.headers,
    body: req.body ?? null,
  });
});

app.listen(PORT, () => {
  console.log(`mock-upstream listening on ${PORT}`);
});

const initFirebase = require("../config/firebase");

exports.uploadLocal = async (req, res) => {
  const file = req.file;
  res.json({
    filename: file.filename,
    url: `/uploads/${file.filename}`,
  });
};

exports.uploadToFirebase = async (req, res, next) => {
  try {
    const admin = initFirebase();
    const bucket = admin.storage().bucket();
    const file = req.file;

    const destination = `products/${Date.now()}-${file.originalname}`;
    await bucket.upload(file.path, { destination, public: true });

    const publicUrl = `https://storage.googleapis.com/${bucket.name}/${destination}`;
    res.json({ url: publicUrl });
  } catch (e) {
    next(e);
  }
};

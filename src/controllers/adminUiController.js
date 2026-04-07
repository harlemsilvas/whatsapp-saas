const path = require("path");

exports.adminUi = async (req, res) => {
  res.sendFile(path.join(__dirname, "../ui/admin.html"));
};

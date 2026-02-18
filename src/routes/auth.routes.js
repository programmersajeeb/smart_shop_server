const router = require('express').Router();
const auth = require('../middlewares/auth');
const c = require('../controllers/auth.controller');

router.post('/firebase', c.firebase);
router.post('/refresh', c.refresh);
router.post('/logout', c.logout);
router.get('/me', auth, c.me);

module.exports = router;

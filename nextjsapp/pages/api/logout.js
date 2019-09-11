import cookies from '../../utils/backend/cookies';

const handler = async (req, res) => {
  res.cookie('refresh_token', "", {
    httpOnly: true,
    path: '/',
    expires: new Date(0)
  });
  res.status(200).json({
    success: 'ok'
  });
};

export default cookies(handler);
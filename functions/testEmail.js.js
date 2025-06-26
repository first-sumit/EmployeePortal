const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: 'unison.insurance.brokers@gmail.com',
    pass: 'uzzwpxdcvuuxvjwb' // not your Gmail password
  }
});

const mailOptions = {
  from: '"Unison" <unison.insurance.brokers@gmail.com>',
  to: 'sumitpandey2482@gmail.com',
  subject: '🚀 Hello from Gmail + Nodemailer',
  html: '<p>This is a <strong>test email</strong> sent using Gmail and Nodemailer!</p>'
};

transporter.sendMail(mailOptions, (error, info) => {
  if (error) {
    return console.error('❌ Error:', error);
  }
  console.log('✅ Email sent:', info.response);
});

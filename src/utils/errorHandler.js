export const handleError = (error) => {
  if (error.code) {
    switch (error.code) {
      case 'auth/user-not-found':
        return 'User not found.';
      case 'auth/wrong-password':
        return 'Incorrect password.';
      case 'auth/email-already-in-use':
        return 'Email already in use.';
      default:
        return error.message;
    }
  }
  return 'An unexpected error occurred.';
};

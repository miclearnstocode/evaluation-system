from flask_bcrypt import Bcrypt
bcrypt = Bcrypt()
hashed_password = bcrypt.generate_password_hash('S4dmin_1256').decode('utf-8')
print(hashed_password)

#4dmin_1234
#4dmin_1235
#4dmin_1256
#S4dmin_1256
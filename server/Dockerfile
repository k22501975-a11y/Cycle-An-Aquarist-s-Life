FROM eclipse-temurin:21-jdk AS build
WORKDIR /src
COPY . .
RUN ./gradlew bootJar --no-daemon -q

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /src/build/libs/cycle-server-*.jar app.jar
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "/app/app.jar"]

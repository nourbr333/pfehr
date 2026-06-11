package com.hranalytics.hrbackend;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class ProjetrhApplication {

    public static void main(String[] args) {
        SpringApplication.run(ProjetrhApplication.class, args);
    }
}

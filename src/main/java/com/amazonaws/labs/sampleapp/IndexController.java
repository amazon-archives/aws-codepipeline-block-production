/*
 * Copyright 2016 Amazon.com, Inc. or its affiliates. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License").
 * You may not use this file except in compliance with the License.
 * A copy of the License is located at
 *
 *  http://aws.amazon.com/apache2.0
 *
 * or in the "license" file accompanying this file. This file is distributed
 * on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either
 * express or implied. See the License for the specific language governing
 * permissions and limitations under the License.
 */
package com.amazonaws.labs.sampleapp;

import java.util.ArrayList;
import java.util.Date;
import java.util.List;
import java.util.logging.Logger;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Controller;
import org.springframework.ui.Model;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestMethod;

import com.amazonaws.services.cloudwatch.AmazonCloudWatch;
import com.amazonaws.services.cloudwatch.model.Dimension;
import com.amazonaws.services.cloudwatch.model.MetricDatum;
import com.amazonaws.services.cloudwatch.model.PutMetricDataRequest;
import com.amazonaws.services.cloudwatch.model.StandardUnit;

@Controller
public class IndexController {
    private final static Logger LOGGER = Logger.getLogger(IndexController.class.getName());

    @Value("${APPLICATION_NAME}")
    private String applicationName;

    @Value("${DEPLOYMENT_GROUP_NAME}")
    private String deploymentGroupName;

    @Autowired
    private AmazonCloudWatch amazonCloudWatch;

    @RequestMapping(value = "/", method = RequestMethod.GET)
    public String displayIndex(Model model) {
        LOGGER.info("Application name set to: " + applicationName);
        model.addAttribute("applicationName", applicationName);
        LOGGER.info("Deployment Group Name set to: " + deploymentGroupName);
        model.addAttribute("deploymentGroupName", deploymentGroupName);

        emitMetrics(applicationName, deploymentGroupName);
        return "/index";
    }

    private void emitMetrics(final String applicationName, final String deploymentGroupName) {
        final PutMetricDataRequest request = new PutMetricDataRequest();
        request.setNamespace(applicationName);

        MetricDatum metricDatum = new MetricDatum();
        metricDatum.setMetricName("Request");
        metricDatum.setTimestamp(new Date());
        metricDatum.setValue(1.0);
        metricDatum.setUnit(StandardUnit.Count);

        final Dimension dimension = new Dimension();
        dimension.setName("DeploymentGroup");
        dimension.setValue(deploymentGroupName);

        final List<Dimension> dimensions = new ArrayList<>();
        dimensions.add(dimension);
        metricDatum.setDimensions(dimensions);;

        final List<MetricDatum> metrics = new ArrayList<>();
        metrics.add(metricDatum);
        request.setMetricData(metrics);

        amazonCloudWatch.putMetricData(request);
    }
}

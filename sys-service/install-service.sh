serviceFile=docker-pixivQuery.service
cp $serviceFile /etc/systemd/system/
systemctl enable $serviceFile
systemctl start $serviceFile
